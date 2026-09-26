// Generates badges.json and, for any badge with no art yet, a placeholder SVG,
// from the compact table below. This is the single generator: the old
// scripts/make-badge-placeholders.mjs read a catalog shape (catalog.achievements
// / catalog.codes, name as an object) that badges.json has not had for a while
// and crashed on the first entry.
//
//   node src/assets/badges/_gen.mjs
//
// Existing files are left alone, so real art is never clobbered.
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const RING = {
  common: "#8b8b96",
  uncommon: "#3fb950",
  rare: "#4a9eff",
  epic: "#a855f7",
  legendary: "#f5a524",
  secret: "#e0679a",
};

// id | name | rarity | unlock | subject | rule(metric:gte) | description
//
// `unlock` is now explicit: "status" means granted by a maintainer only, never
// by a code or a threshold. It used to be inferred from the folder, with a
// hardcoded id list repeated in four places (two SQL generators, the seeder and
// the client) — and a miss there would mint a redeemable promo code for Owner.
// The art still lives under codes/ and achievements/; only the meaning moved.
const T = [
  // ---- status / admin (maintainer grant only, never a code) ----
  ["owner","Owner","legendary","status","a cat head under a crown inside a shield",null,"Owner of Meowave."],
  ["admin","Admin","legendary","status","a cat head with a star inside a shield",null,"Keeps the place running."],
  ["developer","Developer","epic","status","a cat head with a </> tag inside a shield",null,"Ships the code."],
  ["moderator","Moderator","rare","status","a cat head with a small shield crest",null,"Keeps the peace."],
  ["tester","Tester","rare","status","a cat head with a beetle above it inside a shield",null,"Broke it before you did."],
  ["early_user","Early User","uncommon","code","a cat head with a clock inside a shield",null,"Was here early."],

  // ---- achievements (server-checked thresholds) ----
  ["first_listen","First Listen","common","achievement","a cat with a single glowing eighth note","tracks_played:1","Played your first track."],
  ["listener_i","Listener I","uncommon","achievement","a cat holding a badge reading 100","tracks_played:100","100 tracks played."],
  ["listener_ii","Listener II","rare","achievement","a cat holding a badge reading 1K","tracks_played:1000","1,000 tracks played."],
  ["listener_iii","Listener III","epic","achievement","a cat holding a badge reading 10K","tracks_played:10000","10,000 tracks played."],
  ["music_addict","Music Addict","epic","achievement","a cat wearing headphones with sound rings","listening_minutes:6000","100 hours of listening."],
  ["playlist_creator","Playlist Creator","uncommon","achievement","a cat holding a playlist sheet with a note","playlists_created:1","Made your first playlist."],
  ["playlist_master","Playlist Master","rare","achievement","a crowned cat holding a playlist sheet","playlists_created:25","25 playlists created."],
  ["collector","Collector","uncommon","achievement","a cat holding a heart-marked library card","tracks_liked:50","50 tracks in your library."],
  ["early_listener","Early Listener","rare","achievement","a cat next to a clock at sunrise","sessions_before_7am:10","10 sessions before 7am."],
  ["night_listener","Night Listener","epic","achievement","a cat under a crescent moon","sessions_after_1am:10","10 sessions after 1am."],
  ["marathon_listener","Marathon Listener","epic","achievement","a cat with a 24H marker and stars","longest_session_minutes:1440","A 24-hour listening session."],
  ["genre_explorer","Genre Explorer","rare","achievement","a cat with a magnifier over a vinyl record","distinct_genres:20","Listened across 20 genres."],
  ["streak_master","Streak Master","epic","achievement","a cat silhouette holding the numeral 30","daily_streak:30","30-day listening streak."],
  ["secret_achievement","Secret Achievement","secret","achievement","a blacked-out cat silhouette with a question mark",null,"???"],

  // ---- boykisser cosmetics (promo codes) ----
  ["boykisser","Boykisser","common","code","a plain boykisser cat head",null,"The original."],
  ["music_boykisser","Music Boykisser","uncommon","code","a boykisser cat wearing headphones",null,"Never without a track."],
  ["audiophile_boykisser","Audiophile Boykisser","rare","code","a boykisser cat with a floating music note",null,"Hears the difference."],
  ["developer_boykisser","Developer Boykisser","rare","code","a boykisser cat with a </> tag",null,"Writes the meow."],
  ["admin_boykisser","Admin Boykisser","epic","code","a boykisser cat wearing a crown",null,"Boykisser with power."],
  ["rare_boykisser","Rare Boykisser","rare","code","a boykisser cat with blue sparkles",null,"Not easy to find."],
  ["legendary_boykisser","Legendary Boykisser","legendary","code","a crowned boykisser cat in a golden glow",null,"The rarest cat."],
  ["secret_boykisser","Secret Boykisser","secret","code","a boykisser cat with a rainbow glitch aura and a question mark",null,"???"],
  ["chill_boykisser","Chill Boykisser","uncommon","code","a boykisser cat in sunglasses",null,"No stress."],
  ["headphone_boykisser","Headphone Boykisser","rare","code","a boykisser cat in studio headphones and glasses",null,"Monitoring everything."],
  ["dj_boykisser","DJ Boykisser","epic","code","a boykisser cat behind a DJ deck",null,"Runs the set."],
  ["rock_boykisser","Rock Boykisser","epic","code","a boykisser cat with an electric guitar",null,"Turn it up."],
  ["coffee_boykisser","Coffee Boykisser","uncommon","code","a boykisser cat holding a coffee mug",null,"Fueled."],
  ["sleepy_boykisser","Sleepy Boykisser","uncommon","code","a boykisser cat in a blue nightcap with closed eyes",null,"Sleep playlist enjoyer."],
  ["love_boykisser","Love Boykisser","rare","code","a boykisser cat hugging a red heart",null,"Spreading love."],
  ["party_boykisser","Party Boykisser","epic","code","a boykisser cat with confetti sparkles",null,"Brings the party."],
];

const initials = (name) =>
  name.split(/[\s_]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");

const placeholder = (name, rarity) => {
  const c = RING[rarity];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <circle cx="64" cy="64" r="52" fill="none" stroke="${c}" stroke-width="6" opacity=".9"/>
  <circle cx="64" cy="64" r="40" fill="${c}" opacity=".12"/>
  <text x="64" y="64" text-anchor="middle" dominant-baseline="central"
        font-family="sans-serif" font-size="34" font-weight="700" fill="${c}">${initials(name)}</text>
</svg>
`;
};

const badges = T.map(([id, name, rarity, unlock, subject, rule, description]) => {
  // Art layout is unchanged: achievements in one folder, everything else in the
  // other. Only the unlock semantics are explicit now. Real art is a PNG painted
  // by hand; the SVG is only ever the placeholder.
  const folder = unlock === "achievement" ? "achievements" : "codes";
  const png = join(ROOT, folder, `${id}.png`);
  const b = {
    id,
    name,
    description,
    rarity,
    unlock,
    file: existsSync(png) ? `${folder}/${id}.png` : `${folder}/${id}.svg`,
    subject,
  };
  if (rule) {
    const [metric, gte] = rule.split(":");
    b.rule = { metric, gte: Number(gte) };
  }
  if (rarity === "secret") b.hidden = true;
  return b;
});

mkdirSync(join(ROOT, "achievements"), { recursive: true });
mkdirSync(join(ROOT, "codes"), { recursive: true });

writeFileSync(
  join(ROOT, "badges.json"),
  JSON.stringify({ version: 2, rarity_colors: RING, badges }, null, 2) + "\n"
);
let made = 0, kept = 0;
for (const b of badges) {
  const path = join(ROOT, b.file);
  if (existsSync(path)) { kept++; continue; }
  // Only badges with no PNG either keep or get a placeholder SVG.
  writeFileSync(path, placeholder(b.name, b.rarity));
  made++;
}

const count = (u) => badges.filter((b) => b.unlock === u).length;
console.log(`badges: ${badges.length}`);
console.log(`status: ${count("status")}  achievements: ${count("achievement")}  codes: ${count("code")}`);
console.log(`art: ${kept} existing, ${made} placeholders written`);
