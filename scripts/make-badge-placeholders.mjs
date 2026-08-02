// Writes a placeholder SVG for every badge listed in badges.json that has no
// file on disk yet. Run it after adding entries to the catalog:
//
//   node scripts/make-badge-placeholders.mjs
//
// Existing files are never touched, so real art won't get clobbered.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "src", "assets", "badges");
const catalog = JSON.parse(readFileSync(join(root, "badges.json"), "utf8"));

const RING = {
  common: "#8b8b96",
  rare: "#4a9eff",
  epic: "#a855f7",
  legendary: "#f5a524",
};

// "Night Owl" -> "NO", "First Note" -> "FN". Two letters is all that stays
// readable at 44 px.
const initials = (name) =>
  name
    .split(/[\s-]+/)
    .filter((w) => /[a-z]/i.test(w[0] ?? ""))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "MW";

const placeholder = (badge) => {
  const ring = RING[badge.rarity] ?? RING.common;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <title>${badge.name.en}</title>
  <circle cx="64" cy="64" r="56" fill="${ring}" fill-opacity=".14"/>
  <circle cx="64" cy="64" r="56" fill="none" stroke="${ring}" stroke-width="3" stroke-dasharray="6 5" stroke-opacity=".8"/>
  <circle cx="64" cy="64" r="42" fill="none" stroke="${ring}" stroke-width="1.5" stroke-opacity=".35"/>
  <text x="64" y="64" text-anchor="middle" dominant-baseline="central"
        font-family="system-ui, sans-serif" font-size="34" font-weight="700"
        fill="${ring}">${initials(badge.name.en)}</text>
</svg>
`;
};

let made = 0;
let kept = 0;
for (const badge of [...catalog.achievements, ...catalog.codes]) {
  const path = join(root, badge.file);
  if (existsSync(path)) {
    kept++;
    continue;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, placeholder(badge), "utf8");
  made++;
  console.log("placeholder:", badge.file);
}
console.log(`\n${made} written, ${kept} already had art.`);
