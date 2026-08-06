-- Badges: the catalog, who owns what, and the promo codes.
--
-- Storage cost was a requirement, so nothing here stores an image. `badges`
-- holds ids and thresholds; the art ships inside the app under
-- src/assets/badges/. A user owning 60 badges costs ~60 rows of ~50 bytes.

-- ── catalog ─────────────────────────────────────────────────
create table if not exists public.badges (
  id       text primary key,                 -- matches badges.json
  source   text not null check (source in ('achievement', 'code')),
  rarity   text not null default 'common'
           check (rarity in ('common','rare','epic','legendary')),
  -- Threshold for achievements, checked by check_achievements() below. Null for
  -- code badges and for anything granted by hand.
  metric   text,
  threshold bigint,
  compare  text not null default 'gte' check (compare in ('gte','lte')),
  active   boolean not null default true
);

alter table public.badges enable row level security;

drop policy if exists "badge catalog is public" on public.badges;
create policy "badge catalog is public"
  on public.badges for select using (true);
-- No insert/update policy: the catalog is seeded from SQL, not from the client.

-- ── ownership ───────────────────────────────────────────────
create table if not exists public.user_badges (
  user_id  uuid not null references auth.users (id) on delete cascade,
  badge_id text not null references public.badges (id) on delete cascade,
  earned_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);

alter table public.user_badges enable row level security;

drop policy if exists "badges of visible profiles are readable" on public.user_badges;
create policy "badges of visible profiles are readable"
  on public.user_badges for select using (
    exists (select 1 from public.profiles p where p.id = user_id)
  );
-- Grants happen only through the security-definer functions below, so a client
-- can't hand itself a legendary badge.

create index if not exists user_badges_user_idx on public.user_badges (user_id);

-- ── promo codes ─────────────────────────────────────────────
-- The code itself is never stored: only sha256(upper(trim(code))). A database
-- leak doesn't leak the codes.
create table if not exists public.badge_codes (
  code_hash  text primary key,
  badge_id   text not null references public.badges (id) on delete cascade,
  max_uses   int,                            -- null = unlimited
  uses       int not null default 0,
  expires_at timestamptz,
  note       text                            -- for the maintainer, e.g. "stream giveaway"
);

alter table public.badge_codes enable row level security;
-- No select policy at all: nobody reads this table from the client, not even to
-- count rows. redeem_badge_code() runs as definer and bypasses RLS.

create or replace function public.hash_code(raw text)
returns text language sql immutable as $$
  select encode(digest(upper(btrim(raw)), 'sha256'), 'hex')
$$;

-- pgcrypto provides digest(); Supabase ships it, this just makes it explicit.
create extension if not exists pgcrypto with schema extensions;

create or replace function public.redeem_badge_code(raw_code text)
returns table (badge_id text, already_owned boolean)
language plpgsql security definer set search_path = public, extensions as $$
declare
  uid  uuid := auth.uid();
  rec  public.badge_codes;
  owned boolean;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if raw_code is null or btrim(raw_code) = '' then
    raise exception 'empty code';
  end if;

  select * into rec from public.badge_codes
   where code_hash = public.hash_code(raw_code)
   for update;

  if not found then
    raise exception 'invalid code';
  end if;
  if rec.expires_at is not null and rec.expires_at < now() then
    raise exception 'code expired';
  end if;
  if rec.max_uses is not null and rec.uses >= rec.max_uses then
    raise exception 'code exhausted';
  end if;

  select exists (select 1 from public.user_badges ub
                  where ub.user_id = uid and ub.badge_id = rec.badge_id)
    into owned;

  if not owned then
    insert into public.user_badges (user_id, badge_id) values (uid, rec.badge_id);
    -- A redeem that granted nothing shouldn't burn a use of a limited code.
    update public.badge_codes set uses = uses + 1 where code_hash = rec.code_hash;
  end if;

  return query select rec.badge_id, owned;
end $$;

revoke all on function public.redeem_badge_code(text) from public;
grant execute on function public.redeem_badge_code(text) to authenticated;

-- ── automatic unlocks ───────────────────────────────────────
-- Called from report_listening() and on demand after the profile loads. Grants
-- every achievement whose threshold the caller's stats now satisfy.
create or replace function public.check_achievements()
returns setof text language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    return;
  end if;

  return query
  with me as (
    select s.*,
           (select count(*) from public.friendships f
             where f.status = 'accepted'
               and (f.requester = uid or f.addressee = uid)) as friends,
           (select count(*) from public.user_badges ub where ub.user_id = uid) as badge_count
      from public.user_stats s where s.user_id = uid
  ),
  vals as (
    select b.id, b.compare, b.threshold,
           case b.metric
             when 'listen_seconds'   then me.listen_seconds
             when 'tracks_played'    then me.tracks_played
             when 'unique_tracks'    then me.unique_tracks
             when 'spatial_seconds'  then me.spatial_seconds
             when 'night_sessions'   then me.night_sessions::bigint
             when 'rooms_hosted'     then me.rooms_hosted::bigint
             when 'friends'          then me.friends
             when 'badges_owned'     then me.badge_count
             else null
           end as value
      from public.badges b cross join me
     where b.source = 'achievement' and b.active and b.metric is not null
  ),
  won as (
    insert into public.user_badges (user_id, badge_id)
    select uid, id from vals
     where value is not null
       and ((compare = 'gte' and value >= threshold)
         or (compare = 'lte' and value <= threshold))
    on conflict (user_id, badge_id) do nothing
    returning badge_id
  )
  select badge_id from won;
end $$;

grant execute on function public.check_achievements() to authenticated;

-- Metrics the client tracks locally (connected services, custom EQ presets)
-- can't be verified server-side, so the client reports them and the same
-- threshold check runs here rather than trusting a client-side grant.
create or replace function public.claim_client_badge(badge text, value bigint)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  b   public.badges;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select * into b from public.badges
   where id = badge and source = 'achievement' and active
     and metric in ('services_connected', 'custom_presets', 'leaderboard_best_rank');
  if not found then
    return false;
  end if;

  if not ((b.compare = 'gte' and value >= b.threshold)
       or (b.compare = 'lte' and value <= b.threshold)) then
    return false;
  end if;

  insert into public.user_badges (user_id, badge_id) values (uid, b.id)
  on conflict do nothing;
  return true;
end $$;

grant execute on function public.claim_client_badge(text, bigint) to authenticated;

-- ── seed ────────────────────────────────────────────────────
-- The catalog is NOT seeded here any more.
--
-- This file used to carry a hand-written list of 18 badges. It had drifted so
-- far from src/assets/badges/badges.json that not one id matched: the database
-- knew 18 badges that no longer exist, and none of the 36 that do. Codes then
-- failed with a foreign key violation because the badge they referenced was
-- never inserted.
--
-- badges.json is the single source of truth. Generate the insert from it:
--
--   node supabase/make_badges_sql.mjs   -> supabase/BADGES.sql
--
-- and run that after this schema (or use seed_badges.mjs with a service key).

-- Handing out a code, from the SQL editor only. badge_id must already exist in
-- public.badges or this fails with a foreign key violation (23503), so seed the
-- catalog first:
--
--   insert into public.badge_codes (code_hash, badge_id, max_uses, note)
--   values (public.hash_code('MEOW-BOYKISSER-XXXXX'), 'boykisser', 500, 'pre-release');
--
-- In practice use `node supabase/make_codes.mjs`, which writes the whole file.
-- Never commit the plaintext.

-- ── badges leaderboard ──────────────────────────────────────
-- Defined here, after user_badges exists. It used to sit in 02, where the
-- forward reference killed a fresh install mid-run.
create or replace view public.leaderboard_badges as
  select p.id, p.username, p.avatar_url, p.pinned_badge,
         count(b.badge_id) as badges,
         rank() over (order by count(b.badge_id) desc) as rank
  from public.profiles p
  join public.user_badges b on b.user_id = p.id
  where p.is_public
  group by p.id, p.username, p.avatar_url, p.pinned_badge
  order by badges desc
  limit 100;
