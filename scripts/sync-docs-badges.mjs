// Copies the badge catalog and its art from src/ to docs/, which is what the
// GitHub Pages landing page reads.
//
//   node scripts/sync-docs-badges.mjs
//
// The two copies were kept in sync by hand, so adding a badge showed a broken
// image (or a stale list) on the site until someone remembered. Run this after
// _gen.mjs, or from `npm run sync:docs`.

import { readdirSync, mkdirSync, copyFileSync, statSync, readFileSync } from "node:fs";
import { join, resolve, relative } from "node:path";

const root = resolve(import.meta.dirname, "..");
const from = join(root, "src", "assets", "badges");
const to = join(root, "docs", "assets", "badges");

/** Everything except the generator, which has no business being published. */
const SKIP = new Set(["_gen.mjs"]);

let copied = 0;
let same = 0;

function walk(src, dst) {
  mkdirSync(dst, { recursive: true });
  for (const name of readdirSync(src)) {
    if (SKIP.has(name)) continue;
    const s = join(src, name);
    const d = join(dst, name);
    if (statSync(s).isDirectory()) {
      walk(s, d);
      continue;
    }
    // Compare contents rather than mtime: a fresh clone has arbitrary
    // timestamps, and copying everything every time makes a noisy diff.
    let identical = false;
    try {
      identical = readFileSync(s).equals(readFileSync(d));
    } catch {
      identical = false;
    }
    if (identical) {
      same++;
      continue;
    }
    copyFileSync(s, d);
    copied++;
    console.log("copy:", relative(root, d));
  }
}

walk(from, to);
console.log(`\n${copied} copied, ${same} already up to date.`);
