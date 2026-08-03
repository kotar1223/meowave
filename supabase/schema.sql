-- Meowave: full database schema, one file.
--
-- This is a concatenation of migrations/*.sql in order, kept as a single entry
-- point so a fresh database can be brought up with one command:
--
--   psql "$DB_URL" -f supabase/schema.sql
--
-- Everything is idempotent (create if not exists / create or replace / drop
-- policy if exists), so running it against an existing database is safe and is
-- the normal way to apply changes.
--
-- After this, seed the badge catalog and promo codes:
--
--   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node supabase/seed_badges.mjs
--
-- The badge catalog is also seeded at the end of 03_badges.sql, so plain SQL
-- alone leaves you with a working install; seed_badges.mjs exists to keep the
-- catalog in sync with src/assets/badges/badges.json without editing SQL, and
-- to mint promo codes without ever committing the plaintext.

\echo '== 01_core: profiles, playlists, favorites =='
\ir migrations/01_core.sql

\echo '== 02_profile_extended: banner, stats, leaderboards =='
\ir migrations/02_profile_extended.sql

\echo '== 03_badges: catalog, ownership, promo codes =='
\ir migrations/03_badges.sql

\echo '== 04_social: friends, rooms, messages, presence =='
\ir migrations/04_social.sql

\echo '== 05_favorites: account-synced favorites =='
\ir migrations/05_favorites.sql

\echo ''
\echo 'Schema applied. Next:'
\echo '  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node supabase/seed_badges.mjs'
