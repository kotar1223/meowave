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

drop policy if exists "profiles are readable by everyone" on public.profiles;
create policy "profiles are readable by everyone"
  on public.profiles for select using (true);

drop policy if exists "users insert own profile" on public.profiles;
create policy "users insert own profile"
  on public.profiles for insert with check (auth.uid() = id);

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile"
  on public.profiles for update using (auth.uid() = id);

-- профиль создаётся автоматически при регистрации
-- The email local part is not a valid username: it can contain '+', be shorter
-- than 3 chars, or collide with someone else's. profiles_username_shape and the
-- unique index would both reject it, and because this runs inside the signup
-- transaction a rejection failed the whole registration. Sanitise, then fall
-- back to a guaranteed-unique name and let the user pick a real one later.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  base text;
  candidate text;
begin
  base := regexp_replace(split_part(coalesce(new.email, ''), '@', 1), '[^A-Za-z0-9_.-]', '', 'g');
  if length(base) < 3 then
    base := 'meow' || base;
  end if;
  base := left(base, 20);

  candidate := base;
  -- A handful of attempts, then give up on a pretty name rather than block signup.
  for i in 1..5 loop
    exit when not exists (select 1 from public.profiles where lower(username) = lower(candidate));
    candidate := left(base, 14) || '_' || substr(replace(new.id::text, '-', ''), 1, 5 + i);
  end loop;
  if exists (select 1 from public.profiles where lower(username) = lower(candidate)) then
    candidate := null;
  end if;

  insert into public.profiles (id, username)
  values (new.id, candidate)
  on conflict (id) do nothing;
  return new;
exception when others then
  -- Never let profile cosmetics break account creation.
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── friendships ─────────────────────────────────────────────
-- Defined here rather than in 04_social because the profile visibility policy
-- in 02 and check_achievements() in 03 both reference this table, and Postgres
-- resolves table names when a policy or function body is created, not when it
-- runs. Creating it later made a from-scratch `psql -f schema.sql` fail on 02.
-- The friendship RPCs and the rest of the social layer still live in 04.
--
-- The canonical direction of a friendship is (requester, addressee): a single
-- row covers both people, so queries have to check both columns.
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

-- Stop A->B and B->A existing at the same time: order the pair before indexing it.
create unique index if not exists friendships_pair_key
  on public.friendships (least(requester, addressee), greatest(requester, addressee));

create index if not exists friendships_addressee_idx on public.friendships (addressee, status);

-- ── playlists ───────────────────────────────────────────────
create table if not exists public.playlists (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users (id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);

alter table public.playlists enable row level security;

drop policy if exists "owners manage own playlists" on public.playlists;
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

drop policy if exists "owners manage tracks of own playlists" on public.playlist_tracks;
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

drop policy if exists "avatar images are publicly readable" on storage.objects;
create policy "avatar images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "users upload own avatar" on storage.objects;
create policy "users upload own avatar"
  on storage.objects for insert
  with check (bucket_id = 'avatars'
              and (storage.foldername(name))[1] = auth.uid()::text);

-- An UPDATE policy needs BOTH using and with check. `upsert: true` on an
-- existing avatar is an UPDATE, and with check defaulting to the using clause
-- is not enough here: Storage rewrites metadata on overwrite, so the row is
-- re-validated against with check. Without it the second avatar upload failed
-- while the first one appeared to work.
drop policy if exists "users update own avatar" on storage.objects;
create policy "users update own avatar"
  on storage.objects for update
  using (bucket_id = 'avatars'
         and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars'
         and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "users delete own avatar" on storage.objects;
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
