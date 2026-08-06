-- User playlists, cross-service.
--
-- 01_core already had `playlists` and `playlist_tracks`, but nothing in the app
-- ever wrote to them and the track rows carried no metadata — so a playlist
-- could not be rendered without re-querying every service, which is exactly
-- what fails offline and under rate limits. Same reasoning as favorites: the
-- display data lives on the row.

alter table public.playlists
  add column if not exists description text,
  add column if not exists cover_url   text,
  -- Public playlists are visible on a profile and in rooms.
  add column if not exists is_public   boolean not null default false,
  add column if not exists updated_at  timestamptz not null default now();

alter table public.playlists drop constraint if exists playlists_name_len;
alter table public.playlists
  add constraint playlists_name_len check (length(name) between 1 and 60) not valid;

alter table public.playlist_tracks
  add column if not exists title      text,
  add column if not exists artist     text,
  add column if not exists album      text,
  add column if not exists duration   int not null default 0,
  add column if not exists cover_url  text,
  add column if not exists local_path text,
  add column if not exists added_at   timestamptz not null default now();

-- Explicit ordering: a playlist is an ordered list, unlike favorites. Kept as a
-- sparse integer so a reorder rewrites one row instead of renumbering all.
alter table public.playlist_tracks
  add column if not exists position int not null default 0;

create index if not exists playlist_tracks_order_idx
  on public.playlist_tracks (playlist_id, position);

-- Public playlists need a read path for people who are not the owner.
drop policy if exists "public playlists are readable" on public.playlists;
create policy "public playlists are readable"
  on public.playlists for select
  using (is_public or owner_id = auth.uid());

drop policy if exists "tracks of readable playlists" on public.playlist_tracks;
create policy "tracks of readable playlists"
  on public.playlist_tracks for select
  using (exists (select 1 from public.playlists p
                  where p.id = playlist_id
                    and (p.is_public or p.owner_id = auth.uid())));

-- ── batched playlist write ──────────────────────────────────
-- One call per drag-and-drop instead of one per track.
create or replace function public.playlist_sync(
  pid uuid,
  tracks jsonb default '[]',
  replace_all boolean default true
) returns int language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  n int := 0;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if not exists (select 1 from public.playlists where id = pid and owner_id = uid) then
    raise exception 'not your playlist';
  end if;
  if jsonb_array_length(coalesce(tracks, '[]')) > 2000 then
    raise exception 'playlist too large';
  end if;

  if replace_all then
    delete from public.playlist_tracks where playlist_id = pid;
  end if;

  insert into public.playlist_tracks
    (playlist_id, source, source_track_id, title, artist, album, duration,
     cover_url, local_path, position)
  select
    pid,
    e ->> 'source',
    e ->> 'source_track_id',
    coalesce(nullif(btrim(e ->> 'title'), ''), '—'),
    e ->> 'artist',
    e ->> 'album',
    least(greatest(coalesce((e ->> 'duration')::int, 0), 0), 86400),
    e ->> 'cover_url',
    e ->> 'local_path',
    (ord - 1) * 10
  from jsonb_array_elements(coalesce(tracks, '[]')) with ordinality as u(e, ord)
  where e ->> 'source' is not null and e ->> 'source_track_id' is not null
  on conflict (playlist_id, source, source_track_id) do update
    set position = excluded.position,
        title = excluded.title,
        artist = excluded.artist,
        duration = greatest(public.playlist_tracks.duration, excluded.duration),
        cover_url = coalesce(excluded.cover_url, public.playlist_tracks.cover_url);

  select count(*) into n from public.playlist_tracks where playlist_id = pid;

  update public.playlists set updated_at = now() where id = pid;

  -- Feeds the Playlist Creator / Playlist Master badges.
  update public.user_stats
     set playlists_created = greatest(
           playlists_created,
           (select count(*) from public.playlists where owner_id = uid))
   where user_id = uid;

  return n;
end $$;

revoke all on function public.playlist_sync(uuid, jsonb, boolean) from public;
grant execute on function public.playlist_sync(uuid, jsonb, boolean) to authenticated;

-- playlist_tracks needs the conflict target the upsert above relies on.
-- Added as a unique index rather than a primary key: 01_core may already have
-- defined a different key shape.
create unique index if not exists playlist_tracks_key
  on public.playlist_tracks (playlist_id, source, source_track_id);

create or replace function public.create_playlist(name text, public_flag boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  pid uuid;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if (select count(*) from public.playlists where owner_id = uid) >= 200 then
    raise exception 'playlist limit reached';
  end if;
  insert into public.playlists (owner_id, name, is_public)
  values (uid, left(btrim(name), 60), public_flag)
  returning id into pid;

  update public.user_stats
     set playlists_created = greatest(
           playlists_created,
           (select count(*) from public.playlists where owner_id = uid))
   where user_id = uid;

  return pid;
end $$;

grant execute on function public.create_playlist(text, boolean) to authenticated;
