-- Favorites, synced to the account.
--
-- Until now favorites lived only in the browser's localStorage, so they were
-- tied to one machine: reinstalling the app or signing in elsewhere showed an
-- empty library even though the account was the same.
--
-- A favorite is deliberately NOT a playlist row. Playlists are ordered and
-- user-named; favorites are a set keyed by (source, track id). Reusing
-- playlist_tracks would have meant inventing a magic playlist per user and
-- carrying a `position` nobody reads.
--
-- Track metadata is denormalised into this table on purpose. The services hand
-- out short-lived ids and the app must be able to render the library offline,
-- before any search request resolves. Re-fetching titles for 500 favorites at
-- boot would be 500 requests to services that rate-limit.

create table if not exists public.favorites (
  user_id         uuid not null references auth.users (id) on delete cascade,
  -- "ytm" | "sc" | "ym" | "local"
  source          text not null,
  source_track_id text not null,
  title           text not null,
  artist          text,
  album           text,
  -- Seconds. 0 when the service didn't report a duration yet.
  duration        int  not null default 0,
  cover_url       text,
  -- Local files carry a path instead of a resolvable service id. Kept so the
  -- row is still recognisable on another machine, where the file is missing:
  -- the app shows it greyed out rather than silently dropping it.
  local_path      text,
  added_at        timestamptz not null default now(),
  primary key (user_id, source, source_track_id)
);

alter table public.favorites enable row level security;

-- Favorites are private. Unlike stats and badges there is no social feature
-- reading them, so no policy exposes another user's rows.
drop policy if exists "users manage own favorites" on public.favorites;
create policy "users manage own favorites"
  on public.favorites for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists favorites_user_added_idx
  on public.favorites (user_id, added_at desc);

-- Upserting one row per favorite would be one request per heart click. The app
-- batches instead: it sends what changed since the last flush.
--
-- `adds` is a json array of objects shaped like the table columns; `removes` is
-- a json array of [source, source_track_id] pairs. Both are optional.
create or replace function public.sync_favorites(adds jsonb default '[]', removes jsonb default '[]')
returns int language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  touched int := 0;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  -- A runaway client shouldn't be able to write an unbounded batch.
  if jsonb_array_length(coalesce(adds, '[]')) > 500
     or jsonb_array_length(coalesce(removes, '[]')) > 500 then
    raise exception 'batch too large';
  end if;

  with incoming as (
    select
      nullif(btrim(e ->> 'source'), '')          as source,
      nullif(btrim(e ->> 'source_track_id'), '') as source_track_id,
      coalesce(nullif(btrim(e ->> 'title'), ''), '—') as title,
      e ->> 'artist'    as artist,
      e ->> 'album'     as album,
      -- Clamp: a bad duration would render as a broken progress bar forever.
      least(greatest(coalesce((e ->> 'duration')::int, 0), 0), 86400) as duration,
      e ->> 'cover_url'  as cover_url,
      e ->> 'local_path' as local_path
    from jsonb_array_elements(coalesce(adds, '[]')) e
  ),
  ins as (
    insert into public.favorites
      (user_id, source, source_track_id, title, artist, album, duration, cover_url, local_path)
    select uid, source, source_track_id, title, artist, album, duration, cover_url, local_path
      from incoming
     where source is not null and source_track_id is not null
    on conflict (user_id, source, source_track_id) do update set
      -- added_at is never touched: re-syncing must not reorder the library.
      title     = excluded.title,
      artist    = excluded.artist,
      album     = excluded.album,
      duration  = greatest(public.favorites.duration, excluded.duration),
      cover_url = coalesce(excluded.cover_url, public.favorites.cover_url),
      local_path = coalesce(excluded.local_path, public.favorites.local_path)
    returning 1
  ),
  gone as (
    delete from public.favorites f
     using jsonb_array_elements(coalesce(removes, '[]')) r
     where f.user_id = uid
       and f.source = (r ->> 0)
       and f.source_track_id = (r ->> 1)
    returning 1
  )
  select (select count(*) from ins) + (select count(*) from gone) into touched;

  return touched;
end $$;

revoke all on function public.sync_favorites(jsonb, jsonb) from public;
grant execute on function public.sync_favorites(jsonb, jsonb) to authenticated;

-- unique_tracks in user_stats counts what a user has ever played. The number of
-- favorites is a different thing and the badge catalog may want it, so expose
-- it as a cheap count rather than a stored counter that can drift.
create or replace function public.favorites_count()
returns bigint language sql security definer set search_path = public as $$
  select count(*) from public.favorites where user_id = auth.uid()
$$;

grant execute on function public.favorites_count() to authenticated;
