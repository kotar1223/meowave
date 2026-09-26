-- Profile customisation: banner, colors, and the stats the leaderboard reads.
-- Run after schema.sql.

alter table public.profiles
  add column if not exists banner_url   text,
  add column if not exists bio          text,
  add column if not exists accent       text,          -- hex or accent id picked in the UI
  add column if not exists card_style   text default 'plain',
  add column if not exists pinned_badge text,          -- badge id shown next to the name
  add column if not exists is_public    boolean not null default true,
  add column if not exists created_at   timestamptz not null default now();

-- Usernames are how people find each other in rooms and friend search, so they
-- have to be unique. Case-insensitive: "Cat" and "cat" are the same person.
create unique index if not exists profiles_username_key
  on public.profiles (lower(username)) where username is not null;

-- Postgres has no "add constraint if not exists", so drop first. Without this
-- a second `psql -f schema.sql` died on "constraint already exists" — and since
-- 02 aborted, everything after it (banners, badges, favorites) silently never
-- got applied. That is why avatars and banners looked broken on a re-run.
alter table public.profiles drop constraint if exists profiles_username_shape;
alter table public.profiles
  add constraint profiles_username_shape
  check (username is null or username ~ '^[A-Za-z0-9_.-]{3,24}$') not valid;

alter table public.profiles drop constraint if exists profiles_bio_len;
alter table public.profiles
  add constraint profiles_bio_len check (bio is null or length(bio) <= 300) not valid;

-- Private profiles stay visible to the owner and to friends only. Replaces the
-- blanket "readable by everyone" policy from schema.sql.
drop policy if exists "profiles are readable by everyone" on public.profiles;

drop policy if exists "public profiles, own profile, and friends" on public.profiles;
create policy "public profiles, own profile, and friends"
  on public.profiles for select using (
    is_public
    or auth.uid() = id
    or exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and ((f.requester = auth.uid() and f.addressee = profiles.id)
          or (f.addressee = auth.uid() and f.requester = profiles.id))
    )
  );

-- ── listening stats ─────────────────────────────────────────
-- One row per user. Counters only ever move up, which keeps the leaderboard
-- cheap: no aggregation over a play-history table on every page load.
create table if not exists public.user_stats (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  listen_seconds bigint not null default 0,
  tracks_played  bigint not null default 0,
  unique_tracks  bigint not null default 0,
  spatial_seconds bigint not null default 0,
  night_sessions int    not null default 0,
  rooms_hosted   int    not null default 0,
  updated_at     timestamptz not null default now(),
  constraint stats_sane check (listen_seconds >= 0 and tracks_played >= 0)
);

alter table public.user_stats enable row level security;

drop policy if exists "stats of visible profiles are readable" on public.user_stats;
create policy "stats of visible profiles are readable"
  on public.user_stats for select using (
    exists (select 1 from public.profiles p where p.id = user_id)
  );

drop policy if exists "users write own stats" on public.user_stats;
create policy "users write own stats"
  on public.user_stats for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Weekly buckets, so "top listener this week" doesn't need a play log either.
create table if not exists public.weekly_stats (
  user_id        uuid not null references auth.users (id) on delete cascade,
  week_start     date not null,
  listen_seconds bigint not null default 0,
  primary key (user_id, week_start)
);

alter table public.weekly_stats enable row level security;

drop policy if exists "weekly stats are readable" on public.weekly_stats;
create policy "weekly stats are readable"
  on public.weekly_stats for select using (true);

drop policy if exists "users write own weekly stats" on public.weekly_stats;
create policy "users write own weekly stats"
  on public.weekly_stats for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- The client reports elapsed seconds every so often instead of writing rows per
-- track: fewer requests, and a client that lies can only inflate its own numbers.
-- Deltas are clamped so a hacked client can't claim a year of listening at once.
create or replace function public.report_listening(
  seconds int,
  new_tracks int default 0,
  spatial int default 0,
  is_night boolean default false
) returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  s   int  := least(greatest(coalesce(seconds, 0), 0), 3600);   -- max 1h per call
  sp  int  := least(greatest(coalesce(spatial, 0), 0), s);
  nt  int  := least(greatest(coalesce(new_tracks, 0), 0), 200);
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  insert into public.user_stats as us (user_id, listen_seconds, tracks_played,
                                       unique_tracks, spatial_seconds, night_sessions)
  values (uid, s, nt, nt, sp, case when is_night then 1 else 0 end)
  on conflict (user_id) do update set
    listen_seconds  = us.listen_seconds + s,
    tracks_played   = us.tracks_played + nt,
    unique_tracks   = us.unique_tracks + nt,
    spatial_seconds = us.spatial_seconds + sp,
    night_sessions  = us.night_sessions + case when is_night then 1 else 0 end,
    updated_at      = now();

  insert into public.weekly_stats as ws (user_id, week_start, listen_seconds)
  values (uid, date_trunc('week', now())::date, s)
  on conflict (user_id, week_start) do update set
    listen_seconds = ws.listen_seconds + s;

  perform public.check_achievements();
end $$;

grant execute on function public.report_listening(int, int, int, boolean) to authenticated;

-- ── leaderboards ────────────────────────────────────────────
-- Views, not tables: always current, and RLS on the base tables still applies.
create or replace view public.leaderboard_alltime as
  select p.id, p.username, p.avatar_url, p.pinned_badge,
         s.listen_seconds, s.tracks_played,
         rank() over (order by s.listen_seconds desc) as rank
  from public.user_stats s
  join public.profiles p on p.id = s.user_id
  where p.is_public and s.listen_seconds > 0
  order by s.listen_seconds desc
  limit 100;

create or replace view public.leaderboard_weekly as
  select p.id, p.username, p.avatar_url, p.pinned_badge,
         w.listen_seconds,
         rank() over (order by w.listen_seconds desc) as rank
  from public.weekly_stats w
  join public.profiles p on p.id = w.user_id
  where p.is_public
    and w.week_start = date_trunc('week', now())::date
    and w.listen_seconds > 0
  order by w.listen_seconds desc
  limit 100;

-- The badges leaderboard view lives in 03_badges.sql: it joins
-- public.user_badges, which does not exist yet at this point, so defining it
-- here aborted the whole schema run on a fresh database (42P01) and nothing
-- after this line was ever applied.

-- ── storage: banners ────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('banners', 'banners', true, 4194304,
        array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Avatars accept GIF too, so animated avatars work. 2 MB is plenty once the
-- client has resized; the limit exists to stop someone parking a video here.
update storage.buckets
   set file_size_limit = 2097152,
       allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif']
 where id = 'avatars';

drop policy if exists "banners are publicly readable" on storage.objects;
create policy "banners are publicly readable"
  on storage.objects for select using (bucket_id = 'banners');

drop policy if exists "users upload own banner" on storage.objects;
create policy "users upload own banner"
  on storage.objects for insert
  with check (bucket_id = 'banners'
              and (storage.foldername(name))[1] = auth.uid()::text);

-- Same as avatars: upsert of an existing banner is an UPDATE and needs
-- with check, or only the very first upload succeeds.
drop policy if exists "users update own banner" on storage.objects;
create policy "users update own banner"
  on storage.objects for update
  using (bucket_id = 'banners'
         and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'banners'
         and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "users delete own banner" on storage.objects;
create policy "users delete own banner"
  on storage.objects for delete
  using (bucket_id = 'banners'
         and (storage.foldername(name))[1] = auth.uid()::text);
