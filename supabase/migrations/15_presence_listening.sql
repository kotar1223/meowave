-- 15_presence_listening: listening time that is really saved, and presence
-- that tells the truth.
--
-- Run once in the Supabase SQL editor (or rebuild FULL_SCHEMA.sql with
-- `node supabase/build_sql.mjs`). Safe to run repeatedly.
--
-- 1. report_listening_v2() ended with `perform check_achievements()`. Any
--    error inside it rolled the whole call back, so listen_seconds, the
--    streak and the weekly bucket were never written and the profile kept
--    showing 0 h. The achievements pass is now isolated in its own block.
-- 2. Every column the function writes is created here too, so an install that
--    skipped one of the older migrations no longer fails on a missing column.
-- 3. presence: the client now writes a heartbeat every 20 s and treats a row
--    older than 150 s as offline (the old UI showed made-up "online" users).
--    The table, its policies, the index for "who is fresh" and the grants
--    are (re)declared so the heartbeat cannot fail silently.

-- ── user_stats columns used below ───────────────────────────
alter table public.user_stats
  add column if not exists playlists_created       int not null default 0,
  add column if not exists tracks_liked            int not null default 0,
  add column if not exists sessions_before_7am     int not null default 0,
  add column if not exists sessions_after_1am      int not null default 0,
  add column if not exists longest_session_minutes int not null default 0,
  add column if not exists distinct_genres         int not null default 0,
  add column if not exists daily_streak            int not null default 0,
  add column if not exists longest_streak          int not null default 0,
  add column if not exists last_played_on          date,
  add column if not exists last_night_session_at   timestamptz;

-- ── report_listening_v2 ─────────────────────────────────────
-- Same body as 09_hardening, except for the guarded achievements call at the end.
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
  last_night timestamptz;
  -- Decided once, below, and reused by all three counters. Spelling the same
  -- predicate out three times is how the three copies drifted apart before.
  night_new boolean := false;
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

  select last_played_on, daily_streak, last_night_session_at
    into prev, cur_streak, last_night
    from public.user_stats where user_id = uid;

  -- One night session per continuous run of listening, and only if the run has
  -- actually got going.
  --
  -- The previous guard was `session_minutes <= 1 or updated_at is null or
  -- updated_at < now() - interval '30 minutes'`, a disjunction whose first arm
  -- fires on exactly the reports that should not count. The client zeroes
  -- REPORT.sessionStart after any idle gap over 60 s and re-flushes on a 60 s
  -- timer, so one buffering pause at 03:00 turned every subsequent flush into
  -- a fresh "night session" and the achievements ratcheted up all night. The
  -- `updated_at` arm was dead code on top of that, for the reason above.
  --
  -- Now: the marker column is written only when a session is actually counted,
  -- and a run has to reach two minutes before it counts at all — a session
  -- abandoned inside the first minute should not be a night session.
  night_new := local_hour is not null
    and session_minutes >= 2
    and (last_night is null or last_night < now() - interval '30 minutes');

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
    night_sessions = night_sessions + case when night_new and local_hour >= 2 and local_hour < 5 then 1 else 0 end,
    sessions_after_1am = sessions_after_1am + case when night_new and local_hour >= 1 and local_hour < 5 then 1 else 0 end,
    sessions_before_7am = sessions_before_7am + case when night_new and local_hour >= 4 and local_hour < 7 then 1 else 0 end,
    -- Monotonic maxima: a short session must not lower the record.
    longest_session_minutes = greatest(longest_session_minutes, session_minutes),
    distinct_genres = greatest(distinct_genres, genres),
    -- tracks_liked is maintained by favorites_stats_trg from the real table, so
    -- the client's own count is ignored. The parameter stays for compatibility.
    -- playlists_created gets the same treatment: the client sends the length of
    -- its own local array (app.js:5347), which is exactly as trustworthy as the
    -- rest of a payload that this function was written to stop believing.
    -- greatest(playlists_created, playlists) meant one call with
    -- {playlists: 10000} bought the counter outright, and check_achievements()
    -- handed over Playlist Creator and Playlist Master on the spot. The real
    -- number lives in the playlists table, so ask the table.
    playlists_created = greatest(
      playlists_created,
      (select count(*)::int from public.playlists where owner_id = uid)),
    last_night_session_at = case when night_new then now() else last_night_session_at end,
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

  -- Achievements are a bonus on top of the counters, never a reason to lose
  -- them. A failing check (a badge row missing from the catalogue, a column
  -- one of the older migrations never added) used to abort the whole call,
  -- and the rollback took the listening seconds with it: the "hours are not
  -- counted" report. The counters above are committed either way now.
  begin
    perform public.check_achievements();
  exception when others then
    raise warning 'check_achievements failed: %', sqlerrm;
  end;
end $$;

revoke all on function public.report_listening_v2(int, int, int, int, int, int, int, int) from public;
grant execute on function public.report_listening_v2(int, int, int, int, int, int, int, int) to authenticated;

-- ── presence ────────────────────────────────────────────────
create table if not exists public.presence (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  track        jsonb,
  position     double precision not null default 0,
  playing      boolean not null default false,
  open_to_join boolean not null default false,
  updated_at   timestamptz not null default now()
);

alter table public.presence
  add column if not exists track        jsonb,
  add column if not exists position     double precision not null default 0,
  add column if not exists playing      boolean not null default false,
  add column if not exists open_to_join boolean not null default false,
  add column if not exists updated_at   timestamptz not null default now();

alter table public.presence enable row level security;

drop policy if exists "friends see presence" on public.presence;
create policy "friends see presence"
  on public.presence for select
  using (auth.uid() = user_id or public.is_friend(user_id));

drop policy if exists "users write own presence" on public.presence;
create policy "users write own presence"
  on public.presence for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- "Who is online right now" is a range scan on the heartbeat time.
create index if not exists presence_updated_idx on public.presence (updated_at desc);

grant select, insert, update, delete on public.presence to authenticated;
revoke all on public.presence from anon;
