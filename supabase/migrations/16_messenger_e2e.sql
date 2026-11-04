-- 16_messenger_e2e: a messenger that works like one, end-to-end encryption,
-- three equipped badges.
--
-- Run once in the Supabase SQL editor (or the rebuilt FULL_SCHEMA.sql).
-- Safe to run repeatedly: every statement is if-not-exists / drop-if-exists /
-- create-or-replace.
--
-- 1. messages learn edit, read receipts and replies. The client has been
--    writing `edited_at` since the edit button landed, against a table with
--    no such column and no UPDATE policy at all: every edit failed.
-- 2. End-to-end encryption. Each device makes its own P-256 key pair; only the
--    public half is stored here (e2e_devices). A message is sealed on the
--    sender's machine with a fresh AES-256-GCM key, and that key is wrapped
--    for every device of every participant (ECDH + HKDF). The server keeps the
--    ciphertext and the wrapped keys — it has nothing that opens them.
-- 3. Up to three badges on a profile at once, ownership checked here.

-- ── 1. messages: edit, read, reply, sealed body ─────────────
alter table public.messages add column if not exists edited_at  timestamptz;
alter table public.messages add column if not exists read_at    timestamptz;
alter table public.messages add column if not exists reply_to   bigint
  references public.messages (id) on delete set null;
alter table public.messages add column if not exists ciphertext text;
alter table public.messages add column if not exists e2e        jsonb;

-- A sealed row carries a fixed one-character body. messages_body_check (10,
-- re-declared in 12) wants 1..2000 characters of body or an image, and both
-- files run again on every FULL_SCHEMA re-run — the placeholder keeps sealed
-- rows valid under the old rule, and an outdated client shows a lock instead
-- of base64.
alter table public.messages drop constraint if exists messages_e2e_shape;
alter table public.messages add constraint messages_e2e_shape check (
  (ciphertext is null and e2e is null)
  or (ciphertext is not null and e2e is not null
      and image is null and body = '🔒'
      and length(ciphertext) <= 280000
      and length(e2e::text) <= 60000)
);

create index if not exists messages_unread_idx
  on public.messages (recipient, sender) where read_at is null;
-- on delete set null scans for the replies of a deleted message.
create index if not exists messages_reply_idx
  on public.messages (reply_to) where reply_to is not null;

-- Who may change what. RLS decides *which rows*; this decides *which columns*:
--   author     body / image / ciphertext / e2e   (edited_at is set here)
--   recipient  read_at, once, to the server's clock
-- The conversation, the author, the reply target and the send time are fixed.
create or replace function public.messages_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  tgt public.messages;
begin
  if public.is_service_role() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.sent_at   := now();
    new.edited_at := null;
    new.read_at   := null;
    -- A reply points into the same conversation or nowhere.
    if new.reply_to is not null then
      select * into tgt from public.messages where id = new.reply_to;
      if not found
         or tgt.room_id is distinct from new.room_id
         or tgt.chat_id is distinct from new.chat_id
         or (new.recipient is not null and not (
               (tgt.sender = new.sender    and tgt.recipient = new.recipient)
            or (tgt.sender = new.recipient and tgt.recipient = new.sender)))
      then
        new.reply_to := null;
      end if;
    end if;
    return new;
  end if;

  new.id        := old.id;
  new.room_id   := old.room_id;
  new.chat_id   := old.chat_id;
  new.sender    := old.sender;
  new.recipient := old.recipient;
  new.sent_at   := old.sent_at;
  new.reply_to  := old.reply_to;

  -- e2e_add_keys(): a participant hands the message key to one more of their
  -- own devices. Only the key map may change, and only through that function.
  if coalesce(current_setting('meowave.e2e_share', true), '') = '1' then
    new.body       := old.body;
    new.image      := old.image;
    new.ciphertext := old.ciphertext;
    new.edited_at  := old.edited_at;
    new.read_at    := old.read_at;
    return new;
  end if;

  if uid = old.sender then
    new.read_at := old.read_at;
    if new.body       is distinct from old.body
       or new.image      is distinct from old.image
       or new.ciphertext is distinct from old.ciphertext
       or new.e2e        is distinct from old.e2e then
      new.edited_at := now();
    else
      new.edited_at := old.edited_at;
    end if;
  elsif uid = old.recipient then
    new.body       := old.body;
    new.image      := old.image;
    new.ciphertext := old.ciphertext;
    new.e2e        := old.e2e;
    new.edited_at  := old.edited_at;
    new.read_at    := case when old.read_at is not null then old.read_at
                           when new.read_at is not null then now() end;
  else
    raise exception 'only the author can change a message';
  end if;
  return new;
end $$;

drop trigger if exists messages_guard_trg on public.messages;
create trigger messages_guard_trg
  before insert or update on public.messages
  for each row execute function public.messages_guard();

drop policy if exists "authors edit, recipients mark read" on public.messages;
create policy "authors edit, recipients mark read"
  on public.messages for update
  using (auth.uid() = sender or auth.uid() = recipient)
  with check (auth.uid() = sender or auth.uid() = recipient);

grant update on public.messages to authenticated;

-- Everything from `peer` to the caller is read now. The trigger stamps the
-- server's time, whatever the client sends.
create or replace function public.mark_read(peer uuid)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  update public.messages set read_at = now()
   where recipient = auth.uid() and sender = peer and read_at is null;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.mark_read(uuid) from public;
grant execute on function public.mark_read(uuid) to authenticated;

-- The conversation list in one call: who, the newest message, how many unread.
create or replace function public.dm_threads()
returns table (peer uuid, last_id bigint, unread int)
language sql stable security definer set search_path = public as $$
  select case when m.sender = auth.uid() then m.recipient else m.sender end,
         max(m.id),
         (count(*) filter (where m.recipient = auth.uid() and m.read_at is null))::int
    from public.messages m
   where m.recipient is not null
     and (m.sender = auth.uid() or m.recipient = auth.uid())
   group by 1
   order by 2 desc
   limit 300
$$;
revoke all on function public.dm_threads() from public;
grant execute on function public.dm_threads() to authenticated;

-- ── 2. device keys ──────────────────────────────────────────
-- Public keys only. The private half never leaves the device that made it.
create table if not exists public.e2e_devices (
  user_id    uuid not null references auth.users (id) on delete cascade,
  device_id  text not null check (device_id ~ '^[A-Za-z0-9_-]{16,64}$'),
  pub        jsonb not null check (length(pub::text) <= 600),
  label      text check (label is null or length(label) <= 60),
  created_at timestamptz not null default now(),
  last_seen  timestamptz not null default now(),
  primary key (user_id, device_id)
);

alter table public.e2e_devices enable row level security;

-- Whose keys a caller may fetch: their own, their friends' (DMs are
-- friends-only) and the people they share a room with.
create or replace function public.e2e_can_see(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select target = auth.uid()
      or public.is_friend(target)
      or exists (select 1 from public.room_members a
                   join public.room_members b on b.room_id = a.room_id
                  where a.user_id = auth.uid() and b.user_id = target)
$$;
grant execute on function public.e2e_can_see(uuid) to authenticated;

drop policy if exists "keys of people you can message" on public.e2e_devices;
create policy "keys of people you can message"
  on public.e2e_devices for select using (public.e2e_can_see(user_id));
drop policy if exists "own devices: add" on public.e2e_devices;
create policy "own devices: add"
  on public.e2e_devices for insert with check (auth.uid() = user_id);
drop policy if exists "own devices: refresh" on public.e2e_devices;
create policy "own devices: refresh"
  on public.e2e_devices for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own devices: remove" on public.e2e_devices;
create policy "own devices: remove"
  on public.e2e_devices for delete using (auth.uid() = user_id);

-- At most ten devices: a new one retires the longest-unseen. The key a device
-- registers is fixed; re-registering the same id with another key is refused
-- so nobody can quietly swap a device's key for their own.
create or replace function public.e2e_devices_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.last_seen  := now();
    delete from public.e2e_devices d
     where d.user_id = new.user_id
       and d.device_id in (select device_id from public.e2e_devices
                            where user_id = new.user_id and device_id <> new.device_id
                            order by last_seen desc offset 9);
    return new;
  end if;
  if new.pub is distinct from old.pub and not public.is_service_role() then
    raise exception 'device key cannot change; register a new device';
  end if;
  new.user_id    := old.user_id;
  new.device_id  := old.device_id;
  new.created_at := old.created_at;
  new.last_seen  := now();
  return new;
end $$;

drop trigger if exists e2e_devices_guard_trg on public.e2e_devices;
create trigger e2e_devices_guard_trg
  before insert or update on public.e2e_devices
  for each row execute function public.e2e_devices_guard();

grant select, insert, update, delete on public.e2e_devices to authenticated;
revoke all on public.e2e_devices from anon;

-- A participant gives one more of their own devices the key to messages they
-- can already read (history on a newly signed-in device). Only entries
-- addressed to the caller's own devices are accepted; nothing else in the row
-- can change (see the e2e_share branch of messages_guard()).
--   items: [{"id": 123, "k": {"<uid>:<device>": "<wrapped key>"}}, …]
create or replace function public.e2e_add_keys(items jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  prefix text;
  it jsonb;
  n int := 0;
  c int;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items) > 200 then
    raise exception 'items must be an array of at most 200 entries';
  end if;
  prefix := uid::text || ':';
  perform set_config('meowave.e2e_share', '1', true);
  for it in select value from jsonb_array_elements(items) loop
    continue when jsonb_typeof(it -> 'k') is distinct from 'object';
    continue when exists (select 1 from jsonb_object_keys(it -> 'k') k
                           where left(k, length(prefix)) <> prefix or length(k) > 120);
    continue when exists (select 1 from jsonb_each(it -> 'k') e
                           where jsonb_typeof(e.value) <> 'string' or length(e.value #>> '{}') > 200);
    update public.messages m
       set e2e = jsonb_set(m.e2e, '{k}', coalesce(m.e2e -> 'k', '{}'::jsonb) || (it -> 'k'))
     where m.id = (it ->> 'id')::bigint
       and m.e2e is not null
       and (m.sender = uid or m.recipient = uid
            or (m.room_id is not null and public.in_room(m.room_id)))
       and length((coalesce(m.e2e -> 'k', '{}'::jsonb) || (it -> 'k'))::text) < 55000;
    get diagnostics c = row_count;
    n := n + c;
  end loop;
  perform set_config('meowave.e2e_share', '', true);
  return n;
end $$;
revoke all on function public.e2e_add_keys(jsonb) from public;
grant execute on function public.e2e_add_keys(jsonb) to authenticated;

-- ── 3. three equipped badges ────────────────────────────────
-- `equipped_badge` (14) stays as the first of the three, for older clients.
alter table public.profiles
  add column if not exists equipped_badges text[] not null default '{}';
alter table public.profiles drop constraint if exists profiles_equipped_badges_cap;
alter table public.profiles add constraint profiles_equipped_badges_cap
  check (cardinality(equipped_badges) <= 3);

-- Owned, under either name: five achievements were renamed in the client and
-- user_badges still holds the old ids for whoever earned them first.
create or replace function public.owns_badge(who uuid, badge text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_badges ub
     where ub.user_id = who
       and ub.badge_id = any (array[badge] || case badge
             when 'first_listen'      then array['first_note']
             when 'listener_i'        then array['hour_one']
             when 'night_listener'    then array['night_owl']
             when 'collector'         then array['crate_digger']
             when 'marathon_listener' then array['day_of_sound']
             else array[]::text[] end)
  )
$$;
grant execute on function public.owns_badge(uuid, text) to authenticated;

create or replace function public.set_equipped_badges(ids text[])
returns text[] language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  cleaned text[];
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  -- Owned ones only, first three, order kept, no repeats.
  select coalesce(array_agg(x order by o), '{}') into cleaned from (
    select x, min(o) as o
      from unnest(coalesce(ids, '{}')) with ordinality as u(x, o)
     where public.owns_badge(uid, x)
     group by x
     order by min(o)
     limit 3
  ) s;
  perform set_config('meowave.trusted_write', '1', true);
  update public.profiles
     set equipped_badges = cleaned, equipped_badge = cleaned[1]
   where id = uid;
  perform set_config('meowave.trusted_write', '', true);
  return cleaned;
end $$;
revoke all on function public.set_equipped_badges(text[]) from public;
grant execute on function public.set_equipped_badges(text[]) to authenticated;

-- Wearing a badge is a claim, so a direct write cannot make it. equipped_badge
-- was a plain column: anyone could put "owner" next to their name. An older
-- client that equips one badge directly still works if the badge is theirs,
-- and the list follows it.
create or replace function public.profiles_badges_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_service_role()
     or coalesce(current_setting('meowave.trusted_write', true), '') = '1' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.equipped_badges := '{}';
    new.pinned_badges   := '{}';
    if new.equipped_badge is not null and not public.owns_badge(new.id, new.equipped_badge) then
      new.equipped_badge := null;
    end if;
    if new.equipped_badge is not null then
      new.equipped_badges := array[new.equipped_badge];
    end if;
    return new;
  end if;
  new.equipped_badges := old.equipped_badges;
  if new.equipped_badge is distinct from old.equipped_badge then
    if new.equipped_badge is not null and not public.owns_badge(old.id, new.equipped_badge) then
      new.equipped_badge := old.equipped_badge;
    else
      new.equipped_badges := case when new.equipped_badge is null then '{}'::text[]
                                  else array[new.equipped_badge] end;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists profiles_badges_guard_trg on public.profiles;
create trigger profiles_badges_guard_trg
  before insert or update on public.profiles
  for each row execute function public.profiles_badges_guard();
