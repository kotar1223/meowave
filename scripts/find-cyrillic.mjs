// Lists every source line still containing Cyrillic, so translation passes can
// be verified instead of eyeballed. UI strings in the i18n table are expected
// to stay Russian; pass --code to skip that block.
//
//   node scripts/find-cyrillic.mjs
//   node scripts/find-cyrillic.mjs --verbose

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname, relative } from "node:path";

const SKIP_DIRS = new Set(["node_modules", "target", "gen", ".git", "dist", "icons"]);
const EXTS = new Set([".rs", ".toml", ".sql", ".md", ".mjs", ".js", ".json", ".ps1", ".html"]);
const CYRILLIC = /[\u0400-\u04FF]/;

const verbose = process.argv.includes("--verbose");
const root = process.cwd();
let total = 0;

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (EXTS.has(extname(entry.name))) {
      scan(full);
    }
  }
}

function scan(file) {
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  const hits = [];
  lines.forEach((line, i) => {
    if (CYRILLIC.test(line)) hits.push([i + 1, line.trim()]);
  });
  if (!hits.length) return;
  total += hits.length;
  console.log(`${relative(root, file)}  ->  ${hits.length}`);
  if (verbose) {
    for (const [n, text] of hits) {
      console.log(`   ${String(n).padStart(5)}  ${text.slice(0, 110)}`);
    }
  }
}

walk(root);
console.log(`\nTotal lines with Cyrillic: ${total}`);
