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
-- The badge catalog is not seeded by SQL: seed_badges.mjs is the single source
-- and reads src/assets/badges/badges.json directly, so the catalog cannot drift
-- from the art the app ships. It also mints promo codes without ever committing
-- the plaintext.

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

\echo '== 06_badges_v2: 36-badge catalog, new metrics, pinned badges =='
\ir migrations/06_badges_v2.sql

\echo '== 07_playlists_v2: user playlists with metadata =='
\ir migrations/07_playlists_v2.sql

\echo '== 08_artists_and_prefs: followed artists, EQ presets, prefs =='
\ir migrations/08_artists_and_prefs.sql

\echo '== 09_hardening: server-owned stats, guarded profile writes, indexes =='
\ir migrations/09_hardening.sql

\echo '== 10_social2: group chats, room queue, privacy, leaderboard =='
\ir migrations/10_social2.sql

\echo '== 11_social_fix: social repair functions and policies =='
\ir migrations/11_social_fix.sql

\echo '== 12_social_fix: standalone social recovery =='
\ir migrations/12_social_fix.sql

\echo ''
\echo 'Schema applied. Next:'
\echo '  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node supabase/seed_badges.mjs'
