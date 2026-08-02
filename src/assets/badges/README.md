# Badges

Two folders, two ways to get a badge:

- `achievements/` — unlocked automatically when a stat crosses a threshold. The threshold lives in
  `badges.json` under `rule` (metric + `gte`/`lte`), and the server checks it, not the client.
- `codes/` — unlocked by typing a promo code in Settings → Profile. The code strings are **not** in
  this repo: they live in the `badge_codes` table in Supabase, hashed. Adding a code here would be
  the same as publishing it.

`badges.json` is the single source of truth. The app reads it at boot, so adding a badge means:
add the file, add the entry, done — no code changes.

## Art

Every file listed in `badges.json` currently exists as a placeholder: a rarity-colored ring with
the badge initials. Replace them one by one; the app doesn't care when it happens.

Rules the art has to follow, otherwise it looks broken in the grid:

- **SVG, 128×128 viewBox**, no external fonts, no raster `<image>` inside.
- Artwork centered in a **112 px circle** — the UI clips badges to a circle and draws its own
  rarity ring in the outer 8 px.
- Transparent background. The badge sits on both dark and light themes.
- Single visual focus. At 44 px (profile grid) fine detail turns to mush.
- Keep it under ~6 KB. A 40 KB badge × 60 badges is a slow profile page.

Rarity ring colors, if you want the art to match: common `#8b8b96`, rare `#4a9eff`,
epic `#a855f7`, legendary `#f5a524`.

## Generating the art with ChatGPT / an image model

Raster models (DALL·E etc.) won't give you clean SVG. Two workable routes:

**Route A — ask for SVG source directly** (best result, works with GPT-4o/o3-class models):

> Generate a single SVG icon, 128×128 viewBox, no external fonts, no embedded raster images.
> Subject: `<subject>`. Flat vector, 2–3 colors from this palette: `<rarity color>`, white,
> transparent. All artwork inside a centered circle of radius 56. Transparent background.
> Line weight readable when the icon is scaled down to 44×44. Output only the SVG markup.

**Route B — raster then trace**: generate a 1024×1024 PNG on a transparent/flat background, then
run it through an SVG tracer (Vectorizer, Illustrator Image Trace, `potrace`). Slower, and the
result usually needs cleanup.

If a badge ends up as PNG instead of SVG: keep it at 256×256, save as PNG-8 with alpha where the
art allows, and point `file` at the `.png`. The loader takes any extension.

Subjects that match the current catalog:

| id | subject |
|---|---|
| first_note | a single glowing eighth note |
| hour_one | an hourglass with a sound wave inside |
| day_of_sound | a sun and moon split by a waveform |
| week_of_sound | seven stacked waveform bars forming a crown |
| night_owl | an owl silhouette whose eyes are two vinyl records |
| crate_digger | a crate of records with one pulled halfway out |
| all_services | four interlocking rings forming one circle |
| eq_tinkerer | three equalizer sliders at different heights |
| spatial_head | a head outline with orbiting sound rings |
| host | an open door with a speaker cone behind it |
| social_butterfly | a butterfly whose wings are two waveforms |
| top_of_the_board | a laurel wreath around the numeral 1 |
| early_bird | a bird on a sunrise horizon line |
| beta_cat | a cat head with a "β" on its forehead |
| bug_hunter | a beetle caught in a magnifier |
| contributor | a git branch merging into a heart |
| friend_of_the_cat | two cat paws bumping |
| meowave_day | a calendar page with a cat-ear silhouette |

## Where the app looks

Loader and unlock logic: `src/index.html`, section `badges`.
Server-side tables (`badges`, `user_badges`, `badge_codes`, `redeem_badge_code`): `supabase/schema.sql`.
