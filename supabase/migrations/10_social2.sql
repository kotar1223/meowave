-- Group chats, chat images, room queue with host approval, privacy, leaderboard.
--
-- Depends on 04_social.sql (rooms, messages, friendships). Kept idempotent so
-- a partial prod state can't break a re-run.

-- ── privacy ─────────────────────────────────────────────────
-- One jsonb blob on the profile, Telegram-style knobs:
--   profile: "all" | "friends" | "none"   — who opens the profile page
--   hours:   "all" | "friends" | "me"     — who sees listening time
--   board:   true | false                 — appear in the leaderboard
alter table public.profiles
  add column if not exists privacy jsonb not null default '{}';

-- ── group chats ─────────────────────────────────────────────
create table if not exists public.chats (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(btrim(name)) between 1 and 40),
  -- Small webp data URL kept inline; capped below so a "custom" group can
  -- never eat the database quota.
  avatar     text check (avatar is null or length(avatar) <= 40000),
  about      text check (about is null or length(btrim(about)) <= 200),
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.chats enable row level security;

create table if not exists public.chat_members (
  chat_id   uuid not null references public.chats (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  role      text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (chat_id, user_id)
);

alter table public.chat_members enable row level security;

create index if not exists chat_members_user_idx on public.chat_members (user_id);

create or replace function public.in_chat(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.chat_members
                  where chat_id = c and user_id = auth.uid())
$$;

grant execute on function public.in_chat(uuid) to authenticated;

drop policy if exists "members see their chats" on public.chats;
create policy "members see their chats"
  on public.chats for select using (public.in_chat(id));

drop policy if exists "owners create chats" on public.chats;
create policy "owners create chats"
  on public.chats for insert with check (auth.uid() = created_by);

drop policy if exists "owners customize chats" on public.chats;
create policy "owners customize chats"
  on public.chats for update using (auth.uid() = created_by);

drop policy if exists "owners delete chats" on public.chats;
create policy "owners delete chats"
  on public.chats for delete using (auth.uid() = created_by);

drop policy if exists "members are listed" on public.chat_members;
create policy "members are listed"
  on public.chat_members for select using (
    chat_id in (select chat_id from public.chat_members where user_id = auth.uid())
  );

drop policy if exists "members add people" on public.chat_members;
create policy "members add people"
  on public.chat_members for insert with check (public.in_chat(chat_id));

drop policy if exists "members leave, owners remove" on public.chat_members;
create policy "members leave, owners remove"
  on public.chat_members for delete using (
    auth.uid() = user_id
    or exists (select 1 from public.chats c
                where c.id = chat_id and c.created_by = auth.uid())
  );

-- ── messages: group-chat target + images ────────────────────
alter table public.messages
  add column if not exists chat_id uuid references public.chats (id) on delete cascade;
alter table public.messages
  add column if not exists image text;

-- The original one_target pair grows a third arm; the body check learns that
-- an image can carry a message on its own.
alter table public.messages drop constraint if exists one_target;
alter table public.messages add constraint one_target check (
  (room_id   is not null and recipient is null and chat_id is null)
  or (room_id is null and recipient is not null and chat_id is null)
  or (room_id is null and recipient is null and chat_id is not null)
);

alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages add constraint messages_body_check check (
  image is not null or length(btrim(body)) between 1 and 2000
);

-- Hard ceiling: ~192 KB of base64 per picture. The instance has 500 MB total,
-- so this is the difference between "chat with photos" and "full disk in a
-- weekend". The client compresses far below this; the cap exists so a tampered
-- client cannot skip the compression.
alter table public.messages drop constraint if exists messages_image_cap;
alter table public.messages add constraint messages_image_cap check (
  image is null or length(image) <= 196608
);

create index if not exists messages_chat_idx on public.messages (chat_id, id desc);

drop policy if exists "read room chat and own dms" on public.messages;
create policy "read room chat, group chats and own dms"
  on public.messages for select using (
    (room_id is not null and public.in_room(room_id))
    or (chat_id is not null and public.in_chat(chat_id))
    or auth.uid() in (sender, recipient)
  );

drop policy if exists "send to own rooms and to friends" on public.messages;
create policy "send to rooms, chats and friends"
  on public.messages for insert with check (
    auth.uid() = sender and (
      (room_id is not null and public.in_room(room_id))
      or (chat_id is not null and public.in_chat(chat_id))
      or (recipient is not null and public.is_friend(recipient))
    )
  );

-- ── room queue + play requests ──────────────────────────────
-- The room row holds only "now playing"; this is the line-up after it. Requests
-- are how a listener proposes a track: a host/DJ approves it into the queue,
-- which is the accept/decline notification the owner sees.
create table if not exists public.room_queue (
  id         bigserial primary key,
  room_id    uuid not null references public.rooms (id) on delete cascade,
  position   double precision not null default 0,
  track      jsonb not null,
  added_by   uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.room_queue enable row level security;
create index if not exists room_queue_room_idx on public.room_queue (room_id, position);

create table if not exists public.room_requests (
  id         bigserial primary key,
  room_id    uuid not null references public.rooms (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  track      jsonb not null,
  status     text not null default 'pending' check (status in ('pending','approved','declined')),
  created_at timestamptz not null default now()
);

alter table public.room_requests enable row level security;
create index if not exists room_requests_room_idx on public.room_requests (room_id, status, id desc);

drop policy if exists "queue of a visible room is readable" on public.room_queue;
create policy "queue of a visible room is readable"
  on public.room_queue for select using (
    public.in_room(room_id)
    or exists (select 1 from public.rooms r
                where r.id = room_id and not r.is_private)
  );

drop policy if exists "djs manage the queue" on public.room_queue;
create policy "djs manage the queue"
  on public.room_queue for all
  using (public.can_dj(room_id)) with check (public.can_dj(room_id));

drop policy if exists "members see requests" on public.room_requests;
create policy "members see requests"
  on public.room_requests for select using (public.in_room(room_id));

drop policy if exists "members request tracks" on public.room_requests;
create policy "members request tracks"
  on public.room_requests for insert with check (auth.uid() = user_id and public.in_room(room_id));

-- Pending rows are immortal without this: after a decision the row is updated,
-- and only a host/DJ may decide.
drop policy if exists "djs decide requests, users retract own" on public.room_requests;
create policy "djs decide requests, users retract own"
  on public.room_requests for delete using (auth.uid() = user_id or public.can_dj(room_id));

drop policy if exists "djs update requests" on public.room_requests;
create policy "djs update requests"
  on public.room_requests for update using (public.can_dj(room_id));

-- Approving a request is "move it into the queue" in one round trip.
create or replace function public.approve_request(req bigint)
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

  update public.room_requests set status = 'approved' where id = req;
  insert into public.room_queue (room_id, position, track, added_by)
  values (r.room_id,
          (select coalesce(max(position), 0) + 1
             from public.room_queue where room_id = r.room_id),
          r.track, r.user_id);
  return true;
end $$;

grant execute on function public.approve_request(bigint) to authenticated;

-- ── leaderboard ─────────────────────────────────────────────
-- Lifetime hours from user_stats: weekly_stats belongs to 09_hardening, which
-- not every installation has applied, and "total hours" is the number people
-- actually compare. The privacy blob opts out.
create or replace function public.leaderboard(limit_ int default 50)
returns table (user_id uuid, username text, avatar_url text, seconds bigint, privacy jsonb)
language sql stable security definer set search_path = public as $$
  select u.user_id, p.username, p.avatar_url, u.listen_seconds, p.privacy
    from public.user_stats u
    join public.profiles p on p.id = u.user_id
   where u.listen_seconds > 0
     and coalesce(p.privacy ->> 'board', 'true') <> 'false'
     -- A profile the owner hid entirely must not surface here either; the
     -- board toggle is consent to show hours, not to un-hide the account.
     and p.is_public
   order by u.listen_seconds desc
   limit greatest(coalesce(limit_, 50), 1)
$$;

grant execute on function public.leaderboard(int) to authenticated;

-- ── realtime ────────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array['chats','chat_members','room_queue','room_requests'] loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
