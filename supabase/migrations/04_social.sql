-- Friends, rooms, listen-together sessions, and messages.
--
-- The canonical direction of a friendship is (requester, addressee). A single
-- row covers both people; queries have to check both columns, which is why the
-- helper below exists.

-- ── friendships ─────────────────────────────────────────────
create table if not exists public.friendships (
  requester uuid not null references auth.users (id) on delete cascade,
  addressee uuid not null references auth.users (id) on delete cascade,
  status     text not null default 'pending'
             check (status in ('pending', 'accepted', 'blocked')),
  created_at timestamptz not null default now(),
  primary key (requester, addressee),
  constraint no_self_friendship check (requester <> addressee)
);

alter table public.friendships enable row level security;

-- Stop A→B and B→A existing at the same time: order the pair before indexing it.
create unique index if not exists friendships_pair_key
  on public.friendships (least(requester, addressee), greatest(requester, addressee));

create index if not exists friendships_addressee_idx on public.friendships (addressee, status);

create policy "see own friendships"
  on public.friendships for select
  using (auth.uid() in (requester, addressee));

create policy "send own friend requests"
  on public.friendships for insert
  with check (auth.uid() = requester and status = 'pending');

-- Only the addressee accepts. Either side can block or walk away.
create policy "respond to friend requests"
  on public.friendships for update
  using (auth.uid() in (requester, addressee))
  with check (auth.uid() in (requester, addressee));

create policy "remove own friendships"
  on public.friendships for delete
  using (auth.uid() in (requester, addressee));

create or replace function public.is_friend(other uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.friendships
     where status = 'accepted'
       and ((requester = auth.uid() and addressee = other)
         or (addressee = auth.uid() and requester = other))
  )
$$;

grant execute on function public.is_friend(uuid) to authenticated;

-- Adding by name instead of by uuid: the UI only ever shows usernames.
create or replace function public.add_friend_by_username(name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid    uuid := auth.uid();
  target uuid;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select id into target from public.profiles where lower(username) = lower(btrim(name));
  if target is null then
    raise exception 'no such user';
  end if;
  if target = uid then
    raise exception 'that is you';
  end if;

  -- If they already asked us, accept instead of creating a mirrored request.
  update public.friendships set status = 'accepted'
   where requester = target and addressee = uid and status = 'pending';
  if found then
    perform public.check_achievements();
    return target;
  end if;

  insert into public.friendships (requester, addressee)
  values (uid, target)
  on conflict do nothing;

  return target;
end $$;

grant execute on function public.add_friend_by_username(text) to authenticated;

-- ── rooms ───────────────────────────────────────────────────
create table if not exists public.rooms (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users (id) on delete cascade,
  name       text not null check (length(btrim(name)) between 1 and 40),
  -- Short human code people type to join, e.g. "MEOW-4F2A".
  join_code  text not null unique,
  is_private boolean not null default false,
  topic      text check (topic is null or length(topic) <= 140),
  created_at timestamptz not null default now(),
  -- What the room is playing right now. Kept on the room row rather than in a
  -- separate table so joining is one read and playback sync is one update.
  track      jsonb,
  position   double precision not null default 0,
  playing    boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.rooms enable row level security;

create table if not exists public.room_members (
  room_id   uuid not null references public.rooms (id) on delete cascade,
  user_id   uuid not null references auth.users (id) on delete cascade,
  role      text not null default 'listener' check (role in ('owner','dj','listener')),
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

alter table public.room_members enable row level security;

create index if not exists room_members_user_idx on public.room_members (user_id);

create or replace function public.in_room(r uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.room_members
                  where room_id = r and user_id = auth.uid())
$$;

grant execute on function public.in_room(uuid) to authenticated;

create or replace function public.can_dj(r uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.room_members
                  where room_id = r and user_id = auth.uid()
                    and role in ('owner','dj'))
$$;

grant execute on function public.can_dj(uuid) to authenticated;

create policy "public rooms and joined rooms are visible"
  on public.rooms for select
  using (not is_private or public.in_room(id) or owner_id = auth.uid());

create policy "users create own rooms"
  on public.rooms for insert with check (auth.uid() = owner_id);

-- DJs update playback state; the owner also renames and locks the room.
create policy "djs update room playback"
  on public.rooms for update
  using (public.can_dj(id) or owner_id = auth.uid())
  with check (public.can_dj(id) or owner_id = auth.uid());

create policy "owner deletes room"
  on public.rooms for delete using (auth.uid() = owner_id);

create policy "members of a visible room are listed"
  on public.room_members for select
  using (public.in_room(room_id)
         or exists (select 1 from public.rooms r
                     where r.id = room_id and not r.is_private));

create policy "users leave rooms themselves"
  on public.room_members for delete
  using (auth.uid() = user_id
         or exists (select 1 from public.rooms r
                     where r.id = room_id and r.owner_id = auth.uid()));

-- Joining goes through join_room() so private rooms and the code check can't be
-- bypassed by inserting a membership row directly.
create or replace function public.create_room(name text, private boolean default false)
returns public.rooms language plpgsql security definer set search_path = public as $$
declare
  uid  uuid := auth.uid();
  code text;
  row  public.rooms;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  -- 4 chars from a 32-symbol alphabet, ambiguous letters removed. Retry on the
  -- rare collision rather than making the code longer.
  for i in 1..10 loop
    code := 'MEOW-' || (
      select string_agg(substr('23456789ABCDEFGHJKLMNPQRSTUVWXYZ',
                               1 + floor(random() * 32)::int, 1), '')
        from generate_series(1, 4)
    );
    exit when not exists (select 1 from public.rooms where join_code = code);
    code := null;
  end loop;
  if code is null then
    raise exception 'could not allocate a join code';
  end if;

  insert into public.rooms (owner_id, name, join_code, is_private)
  values (uid, btrim(name), code, private)
  returning * into row;

  insert into public.room_members (room_id, user_id, role)
  values (row.id, uid, 'owner');

  update public.user_stats set rooms_hosted = rooms_hosted + 1 where user_id = uid;
  perform public.check_achievements();

  return row;
end $$;

grant execute on function public.create_room(text, boolean) to authenticated;

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

  insert into public.room_members (room_id, user_id) values (row.id, uid)
  on conflict do nothing;

  return row;
end $$;

grant execute on function public.join_room(text) to authenticated;

-- ── messages ────────────────────────────────────────────────
-- Room chat and direct messages in one table: exactly one of room_id / recipient
-- is set. Realtime subscribers filter on whichever they care about.
create table if not exists public.messages (
  id        bigserial primary key,
  room_id   uuid references public.rooms (id) on delete cascade,
  sender    uuid not null references auth.users (id) on delete cascade,
  recipient uuid references auth.users (id) on delete cascade,
  body      text not null check (length(btrim(body)) between 1 and 2000),
  sent_at   timestamptz not null default now(),
  constraint one_target check (
    (room_id is not null and recipient is null)
    or (room_id is null and recipient is not null)
  )
);

alter table public.messages enable row level security;

create index if not exists messages_room_idx on public.messages (room_id, id desc);
create index if not exists messages_dm_idx on public.messages (recipient, sender, id desc);

create policy "read room chat and own dms"
  on public.messages for select using (
    (room_id is not null and public.in_room(room_id))
    or auth.uid() in (sender, recipient)
  );

-- DMs only between friends, so the inbox can't be spammed by strangers.
create policy "send to own rooms and to friends"
  on public.messages for insert with check (
    auth.uid() = sender and (
      (room_id is not null and public.in_room(room_id))
      or (recipient is not null and public.is_friend(recipient))
    )
  );

create policy "delete own messages"
  on public.messages for delete using (auth.uid() = sender);

-- ── listen together (friends, no room) ──────────────────────
-- A lightweight presence row: what a user is playing right now. Friends read it
-- to follow along without creating a room.
create table if not exists public.presence (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  track      jsonb,
  position   double precision not null default 0,
  playing    boolean not null default false,
  open_to_join boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.presence enable row level security;

create policy "friends see presence"
  on public.presence for select
  using (auth.uid() = user_id or public.is_friend(user_id));

create policy "users write own presence"
  on public.presence for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Realtime: the client subscribes to these instead of polling.
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.room_members;
alter publication supabase_realtime add table public.presence;
