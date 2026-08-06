-- Meowave badges: catalog, ownership, promo codes.
-- Codes are never stored in plaintext. Thresholds are checked server-side.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- catalog --
create table if not exists public.badges (
  id          text primary key,
  name        text not null,
  description text not null default '',
  rarity      text not null check (rarity in
                ('common','uncommon','rare','epic','legendary','secret')),
  unlock      text not null check (unlock in ('achievement','code')),
  file        text not null,
  hidden      boolean not null default false,
  -- {"metric":"tracks_played","gte":100}
  rule        jsonb,
  sort        int not null default 0,
  created_at  timestamptz not null default now(),
  constraint badges_rule_shape check (
    (unlock = 'achievement' and (rule is null or rule ? 'metric'))
    or (unlock = 'code' and rule is null)
  )
);

-- ------------------------------------------------------------- ownership --
create table if not exists public.user_badges (
  user_id    uuid not null references auth.users(id) on delete cascade,
  badge_id   text not null references public.badges(id) on delete cascade,
  source     text not null check (source in ('achievement','code','grant')),
  code_id    uuid,
  earned_at  timestamptz not null default now(),
  primary key (user_id, badge_id)
);
create index if not exists user_badges_user_idx on public.user_badges(user_id);

-- ----------------------------------------------------------------- stats --
-- Whatever your app already writes into. Rules read from here.
create table if not exists public.user_stats (
  user_id               uuid primary key references auth.users(id) on delete cascade,
  tracks_played         int not null default 0,
  listening_minutes     int not null default 0,
  playlists_created     int not null default 0,
  tracks_liked          int not null default 0,
  distinct_genres       int not null default 0,
  daily_streak          int not null default 0,
  longest_session_minutes int not null default 0,
  sessions_before_7am   int not null default 0,
  sessions_after_1am    int not null default 0,
  services_connected    int not null default 0,
  updated_at            timestamptz not null default now()
);

-- ----------------------------------------------------------------- codes --
-- code_hash = encode(digest(upper(btrim(code)), 'sha256'), 'hex')
-- badge_id null + grants_all true  => the code unlocks the whole catalog.
create table if not exists public.badge_codes (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,
  code_hash   text not null unique,
  badge_id    text references public.badges(id) on delete cascade,
  grants_all  boolean not null default false,
  max_uses    int not null default 1,          -- 1 = single use, ever
  uses        int not null default 0,
  expires_at  timestamptz,
  created_at  timestamptz not null default now(),
  constraint badge_codes_target check (grants_all or badge_id is not null)
);

-- ------------------------------------------------------------------ RLS --
alter table public.badges       enable row level security;
alter table public.user_badges  enable row level security;
alter table public.user_stats   enable row level security;
alter table public.badge_codes  enable row level security;

drop policy if exists badges_read on public.badges;
create policy badges_read on public.badges for select to anon, authenticated using (true);

drop policy if exists user_badges_read_own on public.user_badges;
create policy user_badges_read_own on public.user_badges
  for select to authenticated using (user_id = auth.uid());

drop policy if exists user_stats_read_own on public.user_stats;
create policy user_stats_read_own on public.user_stats
  for select to authenticated using (user_id = auth.uid());

-- badge_codes: no policy at all. Nobody selects it directly, ever.
-- Only the SECURITY DEFINER functions below can touch it.
revoke all on public.badge_codes from anon, authenticated;

-- ------------------------------------------------- achievement unlocking --
-- Server decides. The client only asks "recheck me".
create or replace function public.sync_achievements()
returns setof text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  st  public.user_stats%rowtype;
  b   record;
  val numeric;
  ok  boolean;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into st from public.user_stats where user_id = uid;
  if not found then
    insert into public.user_stats(user_id) values (uid) returning * into st;
  end if;

  for b in
    select id, rule from public.badges
    where unlock = 'achievement' and rule is not null
      and id not in (select badge_id from public.user_badges where user_id = uid)
  loop
    begin
      execute format('select ($1).%I::numeric', b.rule->>'metric')
        into val using st;
    exception when others then
      continue;                      -- unknown metric, skip instead of dying
    end;

    ok := true;
    if b.rule ? 'gte' then ok := ok and val >= (b.rule->>'gte')::numeric; end if;
    if b.rule ? 'lte' then ok := ok and val <= (b.rule->>'lte')::numeric; end if;

    if ok then
      insert into public.user_badges(user_id, badge_id, source)
      values (uid, b.id, 'achievement')
      on conflict do nothing;
      return next b.id;              -- newly unlocked
    end if;
  end loop;
end;
$$;

-- --------------------------------------------------------- code redeeming --
-- Returns {ok, error, unlocked[], already[]}.
create or replace function public.redeem_badge_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  h        text;
  c        public.badge_codes%rowtype;
  unlocked text[] := '{}';
  already  text[] := '{}';
  bid      text;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  h := encode(digest(upper(btrim(coalesce(p_code, ''))), 'sha256'), 'hex');

  -- lock the row so two people can't burn a single-use code at once
  select * into c from public.badge_codes where code_hash = h for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;
  if c.expires_at is not null and c.expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;
  if c.uses >= c.max_uses then
    return jsonb_build_object('ok', false, 'error', 'already_used');
  end if;

  if c.grants_all then
    for bid in select id from public.badges loop
      insert into public.user_badges(user_id, badge_id, source, code_id)
      values (uid, bid, 'code', c.id)
      on conflict do nothing;
      if found then unlocked := unlocked || bid; else already := already || bid; end if;
    end loop;
  else
    insert into public.user_badges(user_id, badge_id, source, code_id)
    values (uid, c.badge_id, 'code', c.id)
    on conflict do nothing;
    if found then unlocked := unlocked || c.badge_id;
    else            already  := already  || c.badge_id; end if;
  end if;

  -- burn it even if everything was already owned: one use is one use
  update public.badge_codes set uses = uses + 1 where id = c.id;

  return jsonb_build_object(
    'ok', true,
    'label', c.label,
    'grants_all', c.grants_all,
    'unlocked', to_jsonb(unlocked),
    'already',  to_jsonb(already),
    'uses_left', c.max_uses - c.uses - 1
  );
end;
$$;

revoke all on function public.redeem_badge_code(text) from public, anon;
grant execute on function public.redeem_badge_code(text) to authenticated;
revoke all on function public.sync_achievements() from public, anon;
grant execute on function public.sync_achievements() to authenticated;
