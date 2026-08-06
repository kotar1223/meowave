-- Followed artists, saved EQ presets, and the client preferences that should
-- travel with the account.
--
-- All of it lives on the profile row rather than in new tables: these are small
-- per-user values read together with the profile, so extra tables would mean
-- extra round trips for no benefit. Storage was a stated constraint, and a
-- text[] of artist names plus a small jsonb costs a few hundred bytes.

alter table public.profiles
  -- Artist names, not ids: services disagree on artist identifiers, and the
  -- name is the only key that matches across YouTube Music, SoundCloud and
  -- local files.
  add column if not exists fav_artists text[] not null default '{}',
  -- Equaliser presets the user saved, as [{n, g:[...]}]. Kept as jsonb so
  -- adding a field later needs no migration.
  add column if not exists eq_presets  jsonb  not null default '[]',
  -- Accent colour and appearance choices, so a reinstall looks familiar.
  add column if not exists prefs       jsonb  not null default '{}';

-- Guard rails. These are client-supplied, and an unbounded array would let one
-- account bloat a row that every profile view reads.
alter table public.profiles drop constraint if exists profiles_fav_artists_len;
alter table public.profiles
  add constraint profiles_fav_artists_len
  check (array_length(fav_artists, 1) is null or array_length(fav_artists, 1) <= 500) not valid;

alter table public.profiles drop constraint if exists profiles_eq_presets_len;
alter table public.profiles
  add constraint profiles_eq_presets_len
  check (jsonb_typeof(eq_presets) = 'array' and jsonb_array_length(eq_presets) <= 50) not valid;

-- ── liked artists as a first-class action ───────────────────
-- A function rather than a direct update so the cap is enforced server-side
-- too: a patched client must not be able to write a 10k-element array.
create or replace function public.set_fav_artists(names text[])
returns text[] language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  cleaned text[];
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select array_agg(distinct btrim(x)) into cleaned
    from unnest(coalesce(names, '{}')) as u(x)
   where btrim(x) <> '' and length(btrim(x)) <= 120;

  cleaned := coalesce(cleaned, '{}');
  if array_length(cleaned, 1) > 500 then
    cleaned := cleaned[1:500];
  end if;

  update public.profiles set fav_artists = cleaned where id = uid;
  return cleaned;
end $$;

grant execute on function public.set_fav_artists(text[]) to authenticated;

-- ── saved equaliser presets ─────────────────────────────────
create or replace function public.set_eq_presets(presets jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if jsonb_typeof(coalesce(presets, '[]')) <> 'array' then
    raise exception 'presets must be an array';
  end if;
  if jsonb_array_length(coalesce(presets, '[]')) > 50 then
    raise exception 'too many presets';
  end if;

  update public.profiles set eq_presets = coalesce(presets, '[]') where id = uid;
  return coalesce(presets, '[]');
end $$;

grant execute on function public.set_eq_presets(jsonb) to authenticated;

-- ── appearance preferences ──────────────────────────────────
-- Deliberately permissive about shape (it is the client's own settings blob)
-- but capped in size so it cannot be used as free storage.
create or replace function public.set_prefs(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if length(coalesce(p, '{}')::text) > 8000 then
    raise exception 'preferences too large';
  end if;
  update public.profiles set prefs = coalesce(p, '{}') where id = uid;
  return coalesce(p, '{}');
end $$;

grant execute on function public.set_prefs(jsonb) to authenticated;
