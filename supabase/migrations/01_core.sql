-- Meowave: schema + Row Level Security.
-- Запускать в Supabase SQL Editor (или supabase db push).
-- Безопасность строится на RLS-политиках, а не на секретности anon key.

-- ── profiles ────────────────────────────────────────────────
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  username   text,
  avatar_url text,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles are readable by everyone"
  on public.profiles for select using (true);

create policy "users insert own profile"
  on public.profiles for insert with check (auth.uid() = id);

create policy "users update own profile"
  on public.profiles for update using (auth.uid() = id);

-- профиль создаётся автоматически при регистрации
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username)
  values (new.id, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── playlists ───────────────────────────────────────────────
create table if not exists public.playlists (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users (id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);

alter table public.playlists enable row level security;

create policy "owners manage own playlists"
  on public.playlists for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- ── playlist_tracks ─────────────────────────────────────────
create table if not exists public.playlist_tracks (
  playlist_id     uuid not null references public.playlists (id) on delete cascade,
  source          text not null,          -- spotify | ytm | sc | ym
  source_track_id text not null,
  title           text not null,
  artist          text,
  cover_url       text,
  position        int  not null default 0,
  primary key (playlist_id, source, source_track_id)
);

alter table public.playlist_tracks enable row level security;

create policy "owners manage tracks of own playlists"
  on public.playlist_tracks for all
  using (exists (select 1 from public.playlists p
                 where p.id = playlist_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from public.playlists p
                      where p.id = playlist_id and p.owner_id = auth.uid()));

-- ── storage: bucket "avatars" ───────────────────────────────
-- Публичное чтение; писать можно только в свою папку <uid>/...
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatar images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "users upload own avatar"
  on storage.objects for insert
  with check (bucket_id = 'avatars'
              and (storage.foldername(name))[1] = auth.uid()::text);

create policy "users update own avatar"
  on storage.objects for update
  using (bucket_id = 'avatars'
         and (storage.foldername(name))[1] = auth.uid()::text);

create policy "users delete own avatar"
  on storage.objects for delete
  using (bucket_id = 'avatars'
         and (storage.foldername(name))[1] = auth.uid()::text);

-- ── удаление аккаунта из клиента ────────────────────────────
-- anon key не может удалять auth.users напрямую, поэтому security definer rpc:
create or replace function public.delete_account()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  delete from auth.users where id = auth.uid();
end $$;

revoke all on function public.delete_account() from public;
grant execute on function public.delete_account() to authenticated;
