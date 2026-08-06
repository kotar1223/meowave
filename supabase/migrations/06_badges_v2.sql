-- Badge catalog v2: the 36-badge set (status, achievements, boykissers).
--
-- The art that shipped with the app changed to a catalog keyed on metrics the
-- server never tracked: listening_minutes, playlists_created, tracks_liked,
-- sessions_before_7am, sessions_after_1am, longest_session_minutes,
-- distinct_genres, daily_streak. check_achievements() only knew listen_seconds,
-- tracks_played, unique_tracks, spatial_seconds, night_sessions, rooms_hosted,
-- friends and badges_owned — so seven of the nine new metrics silently matched
-- nothing and those badges could never unlock.
--
-- Storage cost was a hard requirement, so the counters below are all bigint /
-- int on the single existing user_stats row (~40 bytes added per user), and
-- nothing stores a play history.

-- ── new counters ────────────────────────────────────────────
alter table public.user_stats
  -- Derived counters kept as columns rather than computed on read: the
  -- leaderboard and the badge check both read them on every sync.
  add column if not exists playlists_created  int    not null default 0,
  add column if not exists tracks_liked       int    not null default 0,
  add column if not exists sessions_before_7am int   not null default 0,
  add column if not exists sessions_after_1am int    not null default 0,
  -- Longest single uninterrupted session, in minutes.
  add column if not exists longest_session_minutes int not null default 0,
  add column if not exists distinct_genres    int    not null default 0,
  -- Consecutive days with at least one play.
  add column if not exists daily_streak       int    not null default 0,
  add column if not exists longest_streak     int    not null default 0,
  add column if not exists last_played_on     date;

-- ── catalog shape ───────────────────────────────────────────
-- 'status' badges (Owner, Admin, Developer…) are granted by a maintainer, never
-- by a code or a threshold, so they need their own source: leaving them as
-- 'code' would mean minting a code that could leak and hand out Owner.
alter table public.badges drop constraint if exists badges_source_check;
alter table public.badges
  add constraint badges_source_check
  check (source in ('achievement', 'code', 'status'));

alter table public.badges drop constraint if exists badges_rarity_check;
alter table public.badges
  add constraint badges_rarity_check
  check (rarity in ('common', 'uncommon', 'rare', 'epic', 'legendary', 'secret'));

-- ── metric-aware achievement check ──────────────────────────
-- Rewritten to read every metric the shipped catalog can reference. Unknown
-- metrics return null and are skipped rather than treated as zero, so a typo in
-- badges.json cannot hand out a badge to everyone.
create or replace function public.check_achievements()
returns table (badge_id text) language plpgsql security definer
set search_path = public as $$
declare
  uid uuid := auth.uid();
  st  public.user_stats;
  b   record;
  val bigint;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  insert into public.user_stats (user_id) values (uid) on conflict do nothing;
  select * into st from public.user_stats where user_id = uid;

  for b in
    select id, metric, threshold, compare
      from public.badges
     where source = 'achievement'
       and metric is not null
       and threshold is not null
       and id not in (select ub.badge_id from public.user_badges ub where ub.user_id = uid)
  loop
    val := case b.metric
      when 'listen_seconds'   then st.listen_seconds
      -- The catalog counts minutes; the counter is seconds.
      when 'listening_minutes' then st.listen_seconds / 60
      when 'tracks_played'    then st.tracks_played
      when 'unique_tracks'    then st.unique_tracks
      when 'spatial_seconds'  then st.spatial_seconds
      when 'night_sessions'   then st.night_sessions
      when 'rooms_hosted'     then st.rooms_hosted
      when 'playlists_created' then st.playlists_created
      when 'tracks_liked'     then st.tracks_liked
      when 'sessions_before_7am' then st.sessions_before_7am
      when 'sessions_after_1am'  then st.sessions_after_1am
      when 'longest_session_minutes' then st.longest_session_minutes
      when 'distinct_genres'  then st.distinct_genres
      when 'daily_streak'     then greatest(st.daily_streak, st.longest_streak)
      when 'friends' then (
        select count(*) from public.friendships f
         where f.status = 'accepted' and (f.requester = uid or f.addressee = uid))
      when 'badges_owned' then (
        select count(*) from public.user_badges ub where ub.user_id = uid)
      else null
    end;

    continue when val is null;

    if (b.compare = 'gte' and val >= b.threshold)
       or (b.compare = 'lte' and val <= b.threshold) then
      insert into public.user_badges (user_id, badge_id)
      values (uid, b.id)
      on conflict do nothing;
      badge_id := b.id;
      return next;
    end if;
  end loop;
end $$;

grant execute on function public.check_achievements() to authenticated;

-- ── richer listening report ─────────────────────────────────
-- Extended so the client can report the things only it can observe (session
-- length, local hour, genres) while the server still owns the thresholds.
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
  liked := least(greatest(coalesce(liked, 0), 0), 100000);
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
    unique_tracks  = greatest(unique_tracks, unique_tracks + new_tracks),
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
    tracks_liked = greatest(tracks_liked, liked),
    playlists_created = greatest(playlists_created, playlists),
    daily_streak = cur_streak,
    longest_streak = greatest(longest_streak, cur_streak),
    last_played_on = today,
    updated_at = now()
  where user_id = uid;

  -- Weekly bucket for the weekly leaderboard.
  insert into public.weekly_stats (user_id, week, listen_seconds)
  values (uid, date_trunc('week', now())::date, seconds)
  on conflict (user_id, week) do update
    set listen_seconds = public.weekly_stats.listen_seconds + excluded.listen_seconds;
end $$;

revoke all on function public.report_listening_v2(int, int, int, int, int, int, int, int) from public;
grant execute on function public.report_listening_v2(int, int, int, int, int, int, int, int) to authenticated;

-- ── status badges ───────────────────────────────────────────
-- Granted only with the service role key (seed_badges.mjs --grant), which is
-- why there is no client-callable path to them at all.
create or replace function public.grant_badge(target uuid, badge text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.badges where id = badge) then
    raise exception 'unknown badge %', badge;
  end if;
  insert into public.user_badges (user_id, badge_id) values (target, badge)
  on conflict do nothing;
  return true;
end $$;

revoke all on function public.grant_badge(uuid, text) from public;
revoke all on function public.grant_badge(uuid, text) from authenticated;

-- ── pinned badges on the profile card ───────────────────────
-- A small ordered set shown next to the name, like the example in the design.
-- Stored as an array on the profile: at most 5 ids, so it costs nothing and
-- reads in the same query as the profile itself.
alter table public.profiles
  add column if not exists pinned_badges text[] not null default '{}';

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
  update public.profiles set pinned_badges = cleaned where id = uid;
  return cleaned;
end $$;

grant execute on function public.set_pinned_badges(text[]) to authenticated;
