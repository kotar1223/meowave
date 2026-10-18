-- Privacy knobs the schema declared but never read, plus the one column the app
-- has been writing for months against a schema that does not have it.
--
-- Safe to run repeatedly: every statement is if-not-exists / drop-if-exists /
-- create-or-replace.

-- ── 1. equipped badge ────────────────────────────────────────
-- app.js has written `profiles.equipped_badge` since the badge UI landed
-- (`update({equipped_badge: id})`) and read it back in two places, one of them
-- as an embedded resource:
--
--   select("user_id, listen_seconds,
--           profiles(id, username, avatar_url, privacy, equipped_badge))")
--
-- No migration ever created the column, only `pinned_badge` (02) and
-- `pinned_badges` (06). PostgREST resolves embedded column lists server-side,
-- so the unknown name failed the whole request with PGRST200 — the write was
-- swallowed by `.then(()=>{},()=>{})` and the leaderboard fallback died in its
-- `catch`, leaving the table empty. The badge survived only in localStorage.
--
-- Plain text, no foreign key: the ids the client sends (`cat_dj`,
-- `audiophile`, …) are catalogue entries, and a decorative selection should not
-- start failing to save because one of them is missing from `badges`.
alter table public.profiles
  add column if not exists equipped_badge text;

-- The column lives on `profiles`, so the existing select policy already covers
-- reading it. profiles_guard() reverts only the server-owned columns
-- (pinned_badge / pinned_badges), so an owner writing this one is not undone.

-- ── 2. privacy: the `hours` knob, actually enforced ──────────
-- `privacy` is a jsonb blob documented in 10 as Telegram-style knobs:
--
--   profile:  "all" | "friends" | "none"   who opens the profile page
--   hours:    "all" | "friends" | "me"     who sees listening time
--   board:    true | false                 appear in the leaderboard
--   avatar:   "all" | "friends" | "me"
--   username: "all" | "friends" | "me"
--   email:    ...
--
-- Only `board` was ever read, and only by the leaderboard() RPC. `hours` had no
-- reader anywhere in the schema: the user_stats and weekly_stats policies tested
-- `p.is_public` and nothing else. The client's own default for `hours` is "me",
-- so the UI offered a setting that had no effect — set it to "me" and
-- `select listen_seconds from user_stats` still returned every number to every
-- authenticated caller, for as long as the profile was public.
--
-- SECURITY DEFINER for the same reason as in_chat(): a policy that reads its
-- own table re-enters that table's RLS, and Postgres answers 42P17 rather than
-- a denial. friends and profiles both get read here, so this cannot be an
-- inlined subquery.
create or replace function public.privacy_allows(target_id uuid, knob text)
returns boolean language sql stable security definer set search_path=public as $$
  select case coalesce(
           (select p.privacy ->> knob from public.profiles p where p.id = target_id),
           -- Absent key falls back to the client-side default for that knob
           (case when knob = 'hours' then 'me' else 'all' end)
         )
    when 'none'    then target_id = auth.uid()
    when 'me'      then target_id = auth.uid()
    when 'friends' then target_id = auth.uid() or exists (
                      select 1 from public.friendships f
                      where f.status = 'accepted'
                        and ((f.requester = auth.uid() and f.addressee = target_id)
                          or (f.addressee = auth.uid() and f.requester = target_id))
                    )
    else true
  end
$$;
grant execute on function public.privacy_allows(uuid, text) to authenticated;

-- `hours` gates the numbers. `is_public` stays in the condition because it is
-- what "profile: none" writes, and a hidden profile should not leak its stats
-- through this table even when `hours` was left at its default.
--
-- The fallback inside privacy_allows() is 'me' for `hours`, matching
-- paintPrivacy()'s `set("pv-hours", pv.hours || "me")`. Defaulting the server
-- to 'all' instead would have reproduced the original bug from the other side:
-- the UI would show "only me" while the numbers stayed public.
drop policy if exists "stats of visible profiles are readable" on public.user_stats;
-- Parenthesised on purpose. `and` binds tighter than `or`, so the unparenthesised
-- form is correct too — but it reads as though it were not, and that ambiguity
-- is what let a privacy check get bolted on in the wrong place later.
create policy "stats of visible profiles are readable"
  on public.user_stats for select using (
    user_id = auth.uid()
    or (
      exists (select 1 from public.profiles p
              where p.id = user_id and p.is_public)
      and public.privacy_allows(user_id, 'hours')
    )
  );

drop policy if exists "weekly stats of visible profiles are readable" on public.weekly_stats;
create policy "weekly stats of visible profiles are readable"
  on public.weekly_stats for select using (
    user_id = auth.uid()
    or (
      exists (select 1 from public.profiles p
              where p.id = user_id and p.is_public)
      and public.privacy_allows(user_id, 'hours')
    )
  );

-- ── 3. what RLS cannot reach ─────────────────────────────────
-- `avatar` and `username` are columns, and RLS is row-granular: allowing a row
-- means all of it. Masking two fields out of a row is not something a policy
-- can express, so those two knobs stay client-side — maskProf() in app.js
-- already blanks them for a non-friend viewer. Recorded here because "no
-- policy references privacy.avatar" reads like an oversight otherwise; it is a
-- platform limit, and the honest fix would be a masking view over profiles,
-- which is a frontend-wide change rather than a migration.

-- The leaderboard RPC is ours, so it can honour the knobs per returned field
-- even where a policy cannot. `board` was already honoured; RLS cannot mask a
-- column, so username/avatar are nulled here instead. Every original predicate
-- is kept: the function is SECURITY DEFINER, so it does not pass through the
-- user_stats policy and has to do the filtering itself.
create or replace function public.leaderboard(limit_ int default 50)
returns table (user_id uuid, username text, avatar_url text, seconds bigint, privacy jsonb)
language sql stable security definer set search_path=public as $$
  select u.user_id,
         case when public.privacy_allows(u.user_id, 'username')
              then p.username else null end,
         case when public.privacy_allows(u.user_id, 'avatar')
              then p.avatar_url else null end,
         u.listen_seconds,
         p.privacy
    from public.user_stats u
    join public.profiles p on p.id = u.user_id
   where u.listen_seconds > 0
     and coalesce(p.privacy ->> 'board', 'true') <> 'false'
     and p.is_public
   order by u.listen_seconds desc
   limit greatest(coalesce(limit_, 50), 1)
$$;
grant execute on function public.leaderboard(int) to authenticated;