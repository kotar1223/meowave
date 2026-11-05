-- 17_chat_media: full-size pictures and moving GIFs in chats.
--
-- Run once in the Supabase SQL editor (or the rebuilt FULL_SCHEMA.sql).
-- Safe to run repeatedly: every statement is if-not-exists / drop-if-exists /
-- create-or-replace / on-conflict.
--
-- Until now a picture travelled inside the message itself, squeezed to fit
-- messages_image_cap (196 608 characters): photos came out small and a GIF
-- became a still frame. Now the client (src/chatplus.js) encrypts the file
-- with a fresh AES-256-GCM key, uploads only the ciphertext here, and puts
-- the path and the key into the message — which is end-to-end sealed (16).
-- The bucket holds bytes nobody can open without that message; the server
-- never sees a key.
--
-- Layout: chat-media/<uploader uuid>/<32 hex>.bin, application/octet-stream.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-media', 'chat-media', false, 10485760, array['application/octet-stream'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Who may fetch a file: the uploader, their friends, and people who share a
-- room or a group chat with them. The bytes are ciphertext either way; this
-- keeps strangers from listing who uploaded how much.
create or replace function public.can_see_chat_media(folder text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  me    uuid := auth.uid();
  other uuid;
begin
  if me is null or folder is null
     or folder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  other := folder::uuid;
  if other = me then
    return true;
  end if;
  return public.is_friend(other)
      or exists (select 1 from public.room_members a
                   join public.room_members b on b.room_id = a.room_id
                  where a.user_id = me and b.user_id = other)
      or exists (select 1 from public.chat_members a
                   join public.chat_members b on b.chat_id = a.chat_id
                  where a.user_id = me and b.user_id = other);
end
$$;

revoke all on function public.can_see_chat_media(text) from public, anon;
grant execute on function public.can_see_chat_media(text) to authenticated;

drop policy if exists "chat media: upload into own folder" on storage.objects;
create policy "chat media: upload into own folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-media'
              and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "chat media: friends and co-members read" on storage.objects;
create policy "chat media: friends and co-members read"
  on storage.objects for select to authenticated
  using (bucket_id = 'chat-media'
         and public.can_see_chat_media((storage.foldername(name))[1]));

-- No update policy on purpose: a file is written once under a random name.
drop policy if exists "chat media: delete own files" on storage.objects;
create policy "chat media: delete own files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'chat-media'
         and (storage.foldername(name))[1] = auth.uid()::text);
