-- 13_security_fix: fixes from the October 2026 audit.
-- Everything is idempotent; safe to re-run against an existing database.
--
--   1. user_badges leaked the badge list of private profiles (the select
--      policy only required a profile to exist). Now: self, public profiles,
--      friends.
--   2. "djs update requests" had USING but no WITH CHECK: a DJ could rewrite
--      user_id and forge requests attributed to other members. Direct
--      updates are gone; declining goes through decline_request(), which
--      touches nothing but status (approve_request() already existed).
--   3. "members add people" let any chat member insert any user, so
--      strangers could be forced into a group chat. Adding now requires
--      friendship with the person being added and caps a chat at 100 members.
--   4. redeem_badge_code was brute-forceable: five random characters per code
--      and no throttle on the RPC. Failed attempts are now counted per user
--      (10 per 15 minutes) and make_codes.mjs mints longer suffixes. Also,
--      rooms.updated_at is stamped from the server clock so room playback
--      sync is anchored to one clock instead of the DJ's.

-- ── 1. badge lists follow profile privacy ───────────────────
drop policy if exists "badges of visible profiles are readable" on public.user_badges;
create policy "badges of visible profiles are readable"
  on public.user_badges for select using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = user_id and p.is_public)
    or public.is_friend(user_id)
  );
-- Policies run as the querying role: an anon visitor evaluating is_friend()
-- needs EXECUTE, or badge lists 500 for logged-out viewers.
grant execute on function public.is_friend(uuid) to anon;
grant execute on function public.in_chat(uuid) to anon;

-- ── 2. room_requests: no direct updates, decline via RPC ────
drop policy if exists "djs update requests" on public.room_requests;

create or replace function public.decline_request(req bigint)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  r public.room_requests;
begin
  select * into r from public.room_requests where id = req;
  if not found then
    raise exception 'no such request';
  end if;
  if not public.can_dj(r.room_id) then
    raise exception 'not a dj here';
  end if;
  -- Pending only, mirroring approve_request(): an approved request's track
  -- is already queued and must not be flipped after the fact.
  update public.room_requests set status = 'declined'
   where id = r.id and status = 'pending';
  return found;
end $$;

revoke all on function public.decline_request(bigint) from public;
grant execute on function public.decline_request(bigint) to authenticated;

-- ── 3. chat members: friendship consent + size cap ──────────
drop policy if exists "members add people" on public.chat_members;
create policy "members add people" on public.chat_members for insert with check (
  public.in_chat(chat_id)
  and public.is_friend(user_id)
  and (select count(*) from public.chat_members cm
       where cm.chat_id = chat_members.chat_id) < 100
);

-- ── 4a. promo code brute-force throttle ─────────────────────
create table if not exists public.badge_code_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now(),
  ok boolean not null default false
);
alter table public.badge_code_attempts enable row level security;
-- No policies: the definer function below is the only writer and reader.
create index if not exists badge_code_attempts_user_idx
  on public.badge_code_attempts (user_id, at);

create or replace function public.redeem_badge_code(raw_code text)
returns table (badge_id text, already_owned boolean, error text)
language plpgsql security definer set search_path = public, extensions as $$
declare
  uid  uuid := auth.uid();
  rec  public.badge_codes;
  owned boolean;
  fails int;
  aid bigint;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if raw_code is null or btrim(raw_code) = '' then
    raise exception 'empty code';
  end if;

  -- One redeem evaluation at a time per user: keeps the throttle count and
  -- the code's use counter consistent under parallel requests.
  perform pg_advisory_xact_lock(hashtext(uid::text)::bigint);

  -- Throttle: 10 failed attempts per 15 minutes per user. Validation
  -- failures return through the `error` column instead of raising — a
  -- raised error aborts the transaction, which would roll the attempt row
  -- back and leave the cap permanently at zero.
  select count(*) into fails from public.badge_code_attempts
   where user_id = uid and not ok and at > now() - interval '15 minutes';
  if fails >= 10 then
    badge_id := null; already_owned := false;
    error := 'too many attempts — try again in 15 minutes';
    return;
  end if;

  -- Housekeeping: the ledger only needs the last two days.
  delete from public.badge_code_attempts where at < now() - interval '2 days';

  insert into public.badge_code_attempts (user_id) values (uid) returning id into aid;

  select * into rec from public.badge_codes
   where code_hash = public.hash_code(raw_code)
   for update;

  if not found then
    badge_id := null; already_owned := false; error := 'invalid code';
    return;
  end if;
  if rec.expires_at is not null and rec.expires_at < now() then
    badge_id := null; already_owned := false; error := 'code expired';
    return;
  end if;
  if rec.max_uses is not null and rec.uses >= rec.max_uses then
    badge_id := null; already_owned := false; error := 'code exhausted';
    return;
  end if;

  select exists (select 1 from public.user_badges ub
                  where ub.user_id = uid and ub.badge_id = rec.badge_id)
    into owned;

  if not owned then
    insert into public.user_badges (user_id, badge_id) values (uid, rec.badge_id);
    -- A redeem that granted nothing shouldn't burn a use of a limited code.
    update public.badge_codes set uses = uses + 1 where code_hash = rec.code_hash;
  end if;

  update public.badge_code_attempts set ok = true where id = aid;

  badge_id := rec.badge_id; already_owned := owned; error := null;
  return;
end $$;

revoke all on function public.redeem_badge_code(text) from public;
grant execute on function public.redeem_badge_code(text) to authenticated;

-- ── 5. server time anchor for room sync ─────────────────────
-- The room listener anchors its playback position to the server clock
-- (measureRoomSkew in the client). Body-based on purpose: the stream relay
-- forwards a fixed header set and Date is not CORS-exposed cross-origin.
create or replace function public.server_time()
returns timestamptz language sql volatile set search_path = public as $$
  select now()
$$;

revoke all on function public.server_time() from public;
grant execute on function public.server_time() to authenticated, anon;

-- ── 4b. rooms.updated_at: the server is the clock ───────────
create or replace function public.touch_rooms_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists rooms_touch_updated_at on public.rooms;
create trigger rooms_touch_updated_at
  before update on public.rooms
  for each row execute function public.touch_rooms_updated_at();
