-- Hardening pass: the database stops trusting the client.
--
-- Everything here fixes something that was exploitable or outright broken:
--
--   * user_stats / weekly_stats were writable by the client (`for all` with
--     `auth.uid() = user_id`). One PATCH against the REST API set
--     listen_seconds to anything, which handed out first place on both
--     leaderboards *and* every achievement, because check_achievements() reads
--     exactly those columns. All the clamping inside report_listening() was
--     decoration. Writes now only happen inside security-definer functions.
--
--   * profiles was updatable column-by-column, so pinned_badges could be set to
--     any badge id — Owner included — bypassing set_pinned_badges(), and prefs
--     had no size limit outside the RPC.
--
--   * report_listening_v2() inserted into weekly_stats(week), a column that has
--     never existed (it is week_start). Its first call would have failed with
--     42703; it was only safe because nothing called it.
--
--   * playlist_tracks.media_ref is selected by the client on every playlist
--     load. The column did not exist, so loading playlists from an account
--     failed outright.

-- ── stats are server-owned ──────────────────────────────────
drop policy if exists "users write own stats" on public.user_stats;
drop policy if exists "users write own weekly stats" on public.weekly_stats;

-- No insert/update/delete policy at all: report_listening(),
-- report_listening_v2(), playlist_sync(), create_playlist() and the favorites
-- trigger below are all `security definer` and bypass RLS, which is the only
-- path that applies the clamps.
--
-- Belt and braces, in case a policy is ever added back by accident.
revoke insert, update, delete on public.user_stats from anon, authenticated;
revoke insert, update, delete on public.weekly_stats from anon, authenticated;

-- Weekly totals leaked for private profiles: the policy was `using (true)`.
drop policy if exists "weekly stats are readable" on public.weekly_stats;
drop policy if exists "weekly stats of visible profiles are readable" on public.weekly_stats;
create policy "weekly stats of visible profiles are readable"
  on public.weekly_stats for select using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles p
                where p.id = user_id and p.is_public)
  );

-- Same for all-time: the old policy accepted any row whose profile merely
-- existed, i.e. every row.
drop policy if exists "stats of visible profiles are readable" on public.user_stats;
create policy "stats of visible profiles are readable"
  on public.user_stats for select using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles p
                where p.id = user_id and p.is_public)
  );

-- ── profiles: only the harmless columns are client-writable ─
-- A trigger rather than a column-list policy, because RLS cannot express "these
-- columns may not change" and splitting the table would break every read.
--
-- The server-owned columns are unlocked by a transaction-local flag that only
-- the definer functions below set. Checking the JWT role is not enough: those
-- functions run with the *caller's* role in `request.jwt.claim.role`, so a plain
-- role check would have made set_pinned_badges() block itself.
create or replace function public.profiles_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- The service role administers directly and is not subject to this.
  if coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role' then
    return new;
  end if;

  if coalesce(current_setting('meowave.trusted_write', true), '') <> '1' then
    -- Server-owned: set_pinned_badges() verifies ownership of every id.
    new.pinned_badges := old.pinned_badges;
    new.pinned_badge  := old.pinned_badge;
  end if;

  -- History, not state.
  new.created_at := old.created_at;
  new.id         := old.id;

  -- prefs had a length limit only inside set_prefs(); a direct upsert made the
  -- column unbounded storage on an anonymous key.
  if new.prefs is not null and length(new.prefs::text) > 8000 then
    raise exception 'prefs too large';
  end if;
  if new.eq_presets is not null and length(new.eq_presets::text) > 20000 then
    raise exception 'eq_presets too large';
  end if;
  if new.fav_artists is not null and array_length(new.fav_artists, 1) > 500 then
    raise exception 'too many followed artists';
  end if;

  new.updated_at := now();
  return new;
end $$;

drop trigger if exists profiles_guard_trg on public.profiles;
create trigger profiles_guard_trg
  before update on public.profiles
  for each row execute function public.profiles_guard();

-- Re-created so it can raise the flag the guard looks for.
create or replace function public.set_pinned_badges(ids text[])
returns text[] language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  cleaned text[];
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  -- Only badges the user actually owns, capped at five, order preserved.
  select array_agg(x order by ord) into cleaned from (
    select x, ord from unnest(ids) with ordinality as u(x, ord)
     where exists (select 1 from public.user_badges ub
                    where ub.user_id = uid and ub.badge_id = u.x)
     limit 5
  ) s;
  cleaned := coalesce(cleaned, '{}');
  -- true = transaction-local, so it cannot leak into the next request on a
  -- pooled connection.
  perform set_config('meowave.trusted_write', '1', true);
  update public.profiles set pinned_badges = cleaned where id = uid;
  perform set_config('meowave.trusted_write', '', true);
  return cleaned;
end $$;

grant execute on function public.set_pinned_badges(text[]) to authenticated;

-- ── favorites feed tracks_liked ─────────────────────────────
-- The counter behind the Collector badge. It was never incremented by anything,
-- and now that clients cannot write user_stats it has to be maintained here.
-- Recounted rather than incremented: a delta drifts, a count cannot.
create or replace function public.favorites_touch_stats()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  uid uuid := coalesce(new.user_id, old.user_id);
begin
  insert into public.user_stats (user_id) values (uid) on conflict do nothing;
  update public.user_stats
     set tracks_liked = (select count(*) from public.favorites f where f.user_id = uid),
         updated_at = now()
   where user_id = uid;
  return null;
end $$;

drop trigger if exists favorites_stats_trg on public.favorites;
create trigger favorites_stats_trg
  after insert or delete on public.favorites
  for each row execute function public.favorites_touch_stats();

-- ── report_listening_v2: the column is week_start ───────────
create or replace function public.report_listening_v2(
  seconds int default 0,
  new_tracks int default 0,
  spatial int default 0,
  local_hour int default null,
  session_minutes int default 0,
  genres int default 0,
  liked int default 0,
  playlists int default 0
) returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  today date := (now() at time zone 'utc')::date;
  prev date;
  cur_streak int;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  -- Clamp every input. These come from a client that can be patched, and an
  -- unbounded value would poison the leaderboard permanently.
  seconds := least(greatest(coalesce(seconds, 0), 0), 7200);
  new_tracks := least(greatest(coalesce(new_tracks, 0), 0), 200);
  spatial := least(greatest(coalesce(spatial, 0), 0), seconds);
  session_minutes := least(greatest(coalesce(session_minutes, 0), 0), 1440);
  genres := least(greatest(coalesce(genres, 0), 0), 200);
  playlists := least(greatest(coalesce(playlists, 0), 0), 10000);

  insert into public.user_stats (user_id) values (uid) on conflict do nothing;

  select last_played_on, daily_streak into prev, cur_streak
    from public.user_stats where user_id = uid;

  -- Streak: same day is a no-op, yesterday extends, any older gap restarts.
  if prev is null or prev < today - 1 then
    cur_streak := 1;
  elsif prev = today - 1 then
    cur_streak := coalesce(cur_streak, 0) + 1;
  end if;

  update public.user_stats set
    listen_seconds = listen_seconds + seconds,
    tracks_played  = tracks_played + new_tracks,
    -- The client reports "tracks not played yet this session"; without a
    -- per-user seen-set the server cannot truly dedupe across sessions, so
    -- this is an upper bound capped by total plays. The old expression,
    -- greatest(unique_tracks, unique_tracks + n), was just a sum and let the
    -- same song on loop inflate the metric forever.
    unique_tracks  = least(
      coalesce(unique_tracks, 0) + greatest(new_tracks, 0),
      coalesce(tracks_played, 0) + greatest(new_tracks, 0)),
    spatial_seconds = spatial_seconds + spatial,
    night_sessions = night_sessions
      + case when local_hour is not null and local_hour >= 2 and local_hour < 5 then 1 else 0 end,
    sessions_after_1am = sessions_after_1am
      + case when local_hour is not null and local_hour >= 1 and local_hour < 5 then 1 else 0 end,
    sessions_before_7am = sessions_before_7am
      + case when local_hour is not null and local_hour >= 4 and local_hour < 7 then 1 else 0 end,
    -- Monotonic maxima: a short session must not lower the record.
    longest_session_minutes = greatest(longest_session_minutes, session_minutes),
    distinct_genres = greatest(distinct_genres, genres),
    -- tracks_liked is maintained by favorites_stats_trg from the real table, so
    -- the client's own count is ignored. The parameter stays for compatibility.
    playlists_created = greatest(playlists_created, playlists),
    daily_streak = cur_streak,
    longest_streak = greatest(longest_streak, cur_streak),
    last_played_on = today,
    updated_at = now()
  where user_id = uid;

  -- Weekly bucket for the weekly leaderboard.
  insert into public.weekly_stats (user_id, week_start, listen_seconds)
  values (uid, date_trunc('week', now())::date, seconds)
  on conflict (user_id, week_start) do update
    set listen_seconds = public.weekly_stats.listen_seconds + excluded.listen_seconds;

  perform public.check_achievements();
end $$;

revoke all on function public.report_listening_v2(int, int, int, int, int, int, int, int) from public;
grant execute on function public.report_listening_v2(int, int, int, int, int, int, int, int) to authenticated;

-- ── playlist_tracks.media_ref ───────────────────────────────
-- Service-specific handle the client keeps alongside the id (a resolved stream
-- reference for sources that need one). Selected on every playlist load.
alter table public.playlist_tracks
  add column if not exists media_ref text;

create or replace function public.playlist_sync(
  pid uuid,
  tracks jsonb default '[]',
  replace_all boolean default true
) returns int language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  n int := 0;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if not exists (select 1 from public.playlists where id = pid and owner_id = uid) then
    raise exception 'not your playlist';
  end if;
  if jsonb_array_length(coalesce(tracks, '[]')) > 2000 then
    raise exception 'playlist too large';
  end if;

  if replace_all then
    delete from public.playlist_tracks where playlist_id = pid;
  end if;

  insert into public.playlist_tracks
    (playlist_id, source, source_track_id, title, artist, album, duration,
     cover_url, local_path, media_ref, position)
  select
    pid,
    e ->> 'source',
    e ->> 'source_track_id',
    coalesce(nullif(btrim(e ->> 'title'), ''), '—'),
    e ->> 'artist',
    e ->> 'album',
    least(greatest(coalesce((e ->> 'duration')::int, 0), 0), 86400),
    e ->> 'cover_url',
    e ->> 'local_path',
    e ->> 'media_ref',
    (ord - 1) * 10
  from jsonb_array_elements(coalesce(tracks, '[]')) with ordinality as u(e, ord)
  where e ->> 'source' is not null and e ->> 'source_track_id' is not null
  on conflict (playlist_id, source, source_track_id) do update
    set position = excluded.position,
        title = excluded.title,
        artist = excluded.artist,
        duration = greatest(public.playlist_tracks.duration, excluded.duration),
        cover_url = coalesce(excluded.cover_url, public.playlist_tracks.cover_url),
        media_ref = coalesce(excluded.media_ref, public.playlist_tracks.media_ref);

  select count(*) into n from public.playlist_tracks where playlist_id = pid;

  update public.playlists set updated_at = now() where id = pid;

  insert into public.user_stats (user_id) values (uid) on conflict do nothing;
  update public.user_stats
     set playlists_created = greatest(
           playlists_created,
           (select count(*) from public.playlists where owner_id = uid))
   where user_id = uid;

  return n;
end $$;

revoke all on function public.playlist_sync(uuid, jsonb, boolean) from public;
grant execute on function public.playlist_sync(uuid, jsonb, boolean) to authenticated;

-- create_playlist updated `user_stats` for a row that may not exist yet, so the
-- Playlist Creator badge never fired for a brand new account.
create or replace function public.create_playlist(name text, public_flag boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  pid uuid;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if (select count(*) from public.playlists where owner_id = uid) >= 200 then
    raise exception 'playlist limit reached';
  end if;
  insert into public.playlists (owner_id, name, is_public)
  values (uid, left(btrim(name), 60), public_flag)
  returning id into pid;

  insert into public.user_stats (user_id) values (uid) on conflict do nothing;
  update public.user_stats
     set playlists_created = greatest(
           playlists_created,
           (select count(*) from public.playlists where owner_id = uid))
   where user_id = uid;

  perform public.check_achievements();
  return pid;
end $$;

grant execute on function public.create_playlist(text, boolean) to authenticated;

-- ── friendships: only the addressee accepts ─────────────────
-- The comment in 04_social claimed this; the policy allowed either side, so the
-- sender could accept their own request and inflate the `friends` metric.
drop policy if exists "respond to friend requests" on public.friendships;
create policy "respond to friend requests"
  on public.friendships for update
  using (auth.uid() in (requester, addressee))
  with check (
    case
      when status = 'accepted' then auth.uid() = addressee
      else auth.uid() in (requester, addressee)
    end
  );

-- ── rooms: a DJ controls playback, not ownership ────────────
drop policy if exists "djs update room playback" on public.rooms;
drop policy if exists "djs update playback state" on public.rooms;
create policy "djs update playback state"
  on public.rooms for update
  using (public.can_dj(id) or owner_id = auth.uid())
  with check (public.can_dj(id) or owner_id = auth.uid());

create or replace function public.rooms_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role' then
    return new;
  end if;
  -- Only the owner may rename the room or change its visibility; a DJ writing
  -- `track`/`position`/`playing` must not be able to take it over.
  if auth.uid() is distinct from old.owner_id then
    new.owner_id  := old.owner_id;
    new.join_code := old.join_code;
    new.is_private := old.is_private;
    new.name      := old.name;
    new.topic     := old.topic;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists rooms_guard_trg on public.rooms;
create trigger rooms_guard_trg
  before update on public.rooms
  for each row execute function public.rooms_guard();

-- join_room adds the caller as a listener using the secret join code.
create or replace function public.join_room(code text)
returns public.rooms language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  row public.rooms;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select * into row from public.rooms where join_code = upper(btrim(code));
  if not found then
    raise exception 'no such room';
  end if;

  insert into public.room_members (room_id, user_id, role) values (row.id, uid, 'listener')
  on conflict do nothing;

  return row;
end $$;

grant execute on function public.join_room(text) to authenticated;

-- join_room_by_id lets users join a public room directly by its UUID.
create or replace function public.join_room_by_id(r uuid)
returns public.rooms language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  row public.rooms;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select * into row from public.rooms where id = r;
  if not found then
    raise exception 'no such room';
  end if;

  if row.is_private and not exists (
    select 1 from public.room_members m
     where m.room_id = row.id and m.user_id = uid
  ) then
    raise exception 'this room is private, please join with code';
  end if;

  insert into public.room_members (room_id, user_id, role) values (row.id, uid, 'listener')
  on conflict do nothing;

  return row;
end $$;

grant execute on function public.join_room_by_id(uuid) to authenticated;

-- room_members had neither an insert nor an update policy, so the `dj` role that
-- can_dj() checks was unreachable. Promotion is the owner's call.
create or replace function public.set_room_role(room uuid, member uuid, new_role text)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if new_role not in ('dj', 'listener') then
    raise exception 'role must be dj or listener';
  end if;
  if not exists (select 1 from public.rooms r where r.id = room and r.owner_id = uid) then
    raise exception 'not your room';
  end if;
  update public.room_members set role = new_role
   where room_id = room and user_id = member and role <> 'owner';
end $$;

grant execute on function public.set_room_role(uuid, uuid, text) to authenticated;

-- ── grant_badge is service-role only ───────────────────────
-- The revokes in 06 are the only thing standing between this and a client
-- handing itself Owner. Make the function itself refuse, so one stray GRANT
-- cannot undo it.
create or replace function public.grant_badge(target uuid, badge text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'grant_badge requires the service role';
  end if;
  if not exists (select 1 from public.badges where id = badge) then
    raise exception 'unknown badge %', badge;
  end if;
  insert into public.user_badges (user_id, badge_id) values (target, badge)
  on conflict do nothing;
  return true;
end $$;

revoke all on function public.grant_badge(uuid, text) from public;
revoke all on function public.grant_badge(uuid, text) from authenticated;

-- ── leaderboard views run as the caller ─────────────────────
-- Without security_invoker a view executes with its owner's rights and silently
-- bypasses RLS on its base tables — the opposite of what the comment in 02
-- claimed. The is_public filter in the bodies is no longer the only guard.
alter view public.leaderboard_alltime set (security_invoker = on);
alter view public.leaderboard_weekly set (security_invoker = on);
alter view public.leaderboard_badges set (security_invoker = on);

-- ── indexes on foreign keys and lookup paths ────────────────
-- Every one of these backs either a `where` the app runs constantly or an
-- `on delete cascade` that would otherwise sequentially scan.
create index if not exists playlists_owner_idx on public.playlists (owner_id);
create index if not exists messages_sender_idx on public.messages (sender);
create index if not exists user_badges_badge_idx on public.user_badges (badge_id);
create index if not exists badge_codes_badge_idx on public.badge_codes (badge_id);
create index if not exists rooms_owner_idx on public.rooms (owner_id);
-- The weekly leaderboard sorts inside one week.
create index if not exists weekly_stats_board_idx
  on public.weekly_stats (week_start, listen_seconds desc);
-- The all-time leaderboard sorts on this column.
create index if not exists user_stats_listen_idx
  on public.user_stats (listen_seconds desc);

-- Redundant: user_badges_user_idx duplicates the primary key's leading column.
drop index if exists public.user_badges_user_idx;
