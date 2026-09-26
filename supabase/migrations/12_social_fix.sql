-- Standalone recovery migration for installations where the social migrations
-- were applied only partly. Unlike 11_social_fix.sql this file creates the
-- missing social tables before touching their policies, so it can be pasted
-- into an existing Supabase project safely.

create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 40),
  avatar text,
  about text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.chats enable row level security;

create table if not exists public.chat_members (
  chat_id uuid not null references public.chats(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (chat_id,user_id)
);
alter table public.chat_members enable row level security;

create table if not exists public.room_queue (
  id bigserial primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  position double precision not null default 0,
  track jsonb not null,
  added_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.room_queue enable row level security;

create table if not exists public.room_requests (
  id bigserial primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  track jsonb not null,
  status text not null default 'pending' check (status in ('pending','approved','declined')),
  created_at timestamptz not null default now()
);
alter table public.room_requests enable row level security;

alter table public.messages add column if not exists chat_id uuid references public.chats(id) on delete cascade;
alter table public.messages add column if not exists image text;

create index if not exists chat_members_user_idx on public.chat_members(user_id);
create index if not exists room_queue_room_idx on public.room_queue(room_id,position);
create index if not exists room_requests_room_idx on public.room_requests(room_id,status,id desc);

create or replace function public.in_chat(c uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.chat_members where chat_id=c and user_id=auth.uid())
$$;
grant execute on function public.in_chat(uuid) to authenticated;

drop policy if exists "members see their chats" on public.chats;
create policy "members see their chats" on public.chats for select using (public.in_chat(id));
drop policy if exists "owners create chats" on public.chats;
create policy "owners create chats" on public.chats for insert with check (auth.uid()=created_by);
drop policy if exists "owners customize chats" on public.chats;
create policy "owners customize chats" on public.chats for update using (auth.uid()=created_by);
drop policy if exists "owners delete chats" on public.chats;
create policy "owners delete chats" on public.chats for delete using (auth.uid()=created_by);

drop policy if exists "members are listed" on public.chat_members;
create policy "members are listed" on public.chat_members for select using (public.in_chat(chat_id));
drop policy if exists "members add people" on public.chat_members;
create policy "members add people" on public.chat_members for insert with check (public.in_chat(chat_id));
drop policy if exists "members leave, owners remove" on public.chat_members;
create policy "members leave, owners remove" on public.chat_members for delete using (
  auth.uid()=user_id or exists(select 1 from public.chats c where c.id=chat_id and c.created_by=auth.uid())
);

drop policy if exists "queue of a visible room is readable" on public.room_queue;
create policy "queue of a visible room is readable" on public.room_queue for select using (
  public.in_room(room_id) or exists(select 1 from public.rooms r where r.id=room_id and not r.is_private)
);
drop policy if exists "djs manage the queue" on public.room_queue;
create policy "djs manage the queue" on public.room_queue for all
  using (public.can_dj(room_id)) with check (public.can_dj(room_id));

drop policy if exists "members see requests" on public.room_requests;
create policy "members see requests" on public.room_requests for select using (public.in_room(room_id));
drop policy if exists "members request tracks" on public.room_requests;
create policy "members request tracks" on public.room_requests for insert
  with check (auth.uid()=user_id and public.in_room(room_id));
drop policy if exists "djs decide requests, users retract own" on public.room_requests;
create policy "djs decide requests, users retract own" on public.room_requests for delete
  using (auth.uid()=user_id or public.can_dj(room_id));
drop policy if exists "djs update requests" on public.room_requests;
create policy "djs update requests" on public.room_requests for update using (public.can_dj(room_id));

create or replace function public.create_group_chat(name text)
returns public.chats language plpgsql security definer set search_path=public as $$
declare uid uuid:=auth.uid(); row public.chats;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if length(btrim(name)) not between 1 and 40 then raise exception 'group name must be 1..40 characters'; end if;
  insert into public.chats(name,created_by) values(btrim(name),uid) returning * into row;
  insert into public.chat_members(chat_id,user_id,role) values(row.id,uid,'owner');
  return row;
end $$;
grant execute on function public.create_group_chat(text) to authenticated;

create or replace function public.approve_request(req bigint)
returns boolean language plpgsql security definer set search_path=public as $$
declare r public.room_requests; next_pos double precision;
begin
  select * into r from public.room_requests where id=req for update;
  if not found then raise exception 'no such request'; end if;
  if not public.can_dj(r.room_id) then raise exception 'not a dj here'; end if;
  if r.status<>'pending' then return false; end if;
  select coalesce(max(position),0)+1 into next_pos from public.room_queue where room_id=r.room_id;
  update public.room_requests set status='approved' where id=req;
  insert into public.room_queue(room_id,position,track,added_by) values(r.room_id,next_pos,r.track,r.user_id);
  return true;
end $$;
grant execute on function public.approve_request(bigint) to authenticated;

create or replace function public.leave_room(r uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  delete from public.room_members where room_id=r and user_id=auth.uid();
  delete from public.rooms x where x.id=r and not exists(select 1 from public.room_members m where m.room_id=r);
end $$;
grant execute on function public.leave_room(uuid) to authenticated;

-- The room client also reads and updates the current track directly. These
-- policies are repeated here because older installations often had rooms but
-- no usable membership policy after a failed social migration.
drop policy if exists "public rooms and joined rooms are visible" on public.rooms;
create policy "public rooms and joined rooms are visible" on public.rooms for select using (
  not is_private or public.in_room(id) or owner_id=auth.uid()
);
drop policy if exists "users create own rooms" on public.rooms;
create policy "users create own rooms" on public.rooms for insert with check (auth.uid()=owner_id);
drop policy if exists "djs update playback state" on public.rooms;
drop policy if exists "djs update room playback" on public.rooms;
create policy "djs update playback state" on public.rooms for update
  using (public.can_dj(id) or owner_id=auth.uid())
  with check (public.can_dj(id) or owner_id=auth.uid());
drop policy if exists "owner deletes room" on public.rooms;
create policy "owner deletes room" on public.rooms for delete using (owner_id=auth.uid());

drop policy if exists "members of a visible room are listed" on public.room_members;
create policy "members of a visible room are listed" on public.room_members for select using (
  public.in_room(room_id) or exists(select 1 from public.rooms r where r.id=room_id and not r.is_private)
);
drop policy if exists "users leave rooms themselves" on public.room_members;
create policy "users leave rooms themselves" on public.room_members for delete using (
  auth.uid()=user_id or exists(select 1 from public.rooms r where r.id=room_id and r.owner_id=auth.uid())
);

-- Do not let a listener's client crash when the room shell is rendered on an
-- older database: the client uses these functions and tables as one contract.
notify pgrst, 'reload schema';
