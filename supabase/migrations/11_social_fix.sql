-- Repair pack for the social schema: idempotent re-creation of the policies
-- from 10 (a partially applied 10 left the chats tables with RLS enabled and
-- no insert policy, so creating a group chat failed with a bare RLS error),
-- plus the missing room lifecycle pieces.
--
-- Safe to run on any state; everything is drop-if-exists / if-not-exists.

-- ── chats: policies, recreated verbatim ────────────────────
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

-- chat_members
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

-- messages: full read/send matrix from 10, recreated
drop policy if exists "read room chat, group chats and own dms" on public.messages;
create policy "read room chat, group chats and own dms"
  on public.messages for select using (
    (room_id is not null and public.in_room(room_id))
    or (chat_id is not null and public.in_chat(chat_id))
    or auth.uid() in (sender, recipient)
  );

drop policy if exists "send to rooms, chats and friends" on public.messages;
create policy "send to rooms, chats and friends"
  on public.messages for insert with check (
    auth.uid() = sender and (
      (room_id is not null and public.in_room(room_id))
      or (chat_id is not null and public.in_chat(chat_id))
      or (recipient is not null and public.is_friend(recipient))
    )
  );

-- room_queue / room_requests policies
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

drop policy if exists "djs decide requests, users retract own" on public.room_requests;
create policy "djs decide requests, users retract own"
  on public.room_requests for delete using (auth.uid() = user_id or public.can_dj(room_id));

drop policy if exists "djs update requests" on public.room_requests;
create policy "djs update requests"
  on public.room_requests for update using (public.can_dj(room_id));

-- ── group chat creation as an RPC ──────────────────────────
-- security definer sidesteps any policy trouble on the chats insert: the
-- caller is validated in code, and the owner membership is written in the
-- same transaction so a half-created chat cannot exist.
create or replace function public.create_group_chat(name text)
returns public.chats language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  row public.chats;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  insert into public.chats (name, created_by)
  values (btrim(name), uid)
  returning * into row;
  insert into public.chat_members (chat_id, user_id, role)
  values (row.id, uid, 'owner');
  return row;
end $$;

grant execute on function public.create_group_chat(text) to authenticated;

-- ── leaving a room that then runs empty ────────────────────
-- The membership goes first, then the room row if nobody is left. Doing both
-- in one security-definer call means a listener can leave a room whose owner
-- abandoned it — the client-side delete would fail RLS (not the owner).
create or replace function public.leave_room(r uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.room_members
   where room_id = r and user_id = auth.uid();

  delete from public.rooms rws
   where rws.id = r
     and not exists (select 1 from public.room_members m where m.room_id = r);
end $$;

grant execute on function public.leave_room(uuid) to authenticated;

-- Belt and braces: whichever way the last membership row disappears (kick,
-- manual SQL, account deletion), the room does not linger as a ghost.
create or replace function public.room_cleanup()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.rooms r
   where r.id = old.room_id
     and not exists (select 1 from public.room_members m where m.room_id = old.room_id);
  return old;
end $$;

drop trigger if exists room_empty_cleanup on public.room_members;
create trigger room_empty_cleanup
  after delete on public.room_members
  for each row execute function public.room_cleanup();
