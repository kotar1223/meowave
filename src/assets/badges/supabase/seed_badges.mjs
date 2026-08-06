#!/usr/bin/env node
// Pushes badges.json into the `badges` table and mints the master code.
//
//   SUPABASE_URL=https://xxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
//   node seed_badges.mjs [--master MEOWAVE-XXXX-XXXX]
//
// Service role key only. Never ship this file to the client.

import { readFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) {
  console.error("set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sha256 = (s) => createHash("sha256").update(s.trim().toUpperCase()).digest("hex");

const group = () =>
  Array.from(randomBytes(4))
    .map((b) => "ACDEFHJKLMNPQRTUVWXY34679"[b % 25])
    .join("");

const argMaster = process.argv.includes("--master")
  ? process.argv[process.argv.indexOf("--master") + 1]
  : null;
const master = (argMaster || `MEOWAVE-${group()}-${group()}`).toUpperCase();

async function rest(path, method, body) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

const cat = JSON.parse(readFileSync(join(ROOT, "badges.json"), "utf8"));

const rows = cat.badges.map((b, i) => ({
  id: b.id,
  name: b.name,
  description: b.description ?? "",
  rarity: b.rarity,
  unlock: b.unlock,
  file: b.file,
  hidden: !!b.hidden,
  rule: b.unlock === "achievement" ? b.rule ?? null : null,
  sort: i,
}));

await rest("badges?on_conflict=id", "POST", rows);
console.log(`catalog: ${rows.length} badges upserted`);

// one code per code-unlock badge, single use each
const perBadge = cat.badges
  .filter((b) => b.unlock === "code")
  .map((b) => {
    const code = `MW-${b.id.toUpperCase().replace(/_/g, "")}-${group()}`;
    return {
      plain: code,
      row: {
        label: b.name,
        code_hash: sha256(code),
        badge_id: b.id,
        grants_all: false,
        max_uses: 1,
      },
    };
  });

const masterRow = {
  label: "MASTER — unlocks everything, one use",
  code_hash: sha256(master),
  badge_id: null,
  grants_all: true,
  max_uses: 1,
};

await rest("badge_codes?on_conflict=code_hash", "POST", [
  ...perBadge.map((p) => p.row),
  masterRow,
]);

console.log(`codes: ${perBadge.length + 1} inserted (hashed)\n`);
console.log("=== WRITE THESE DOWN. They are not recoverable from the DB. ===\n");
for (const p of perBadge) console.log(`  ${p.row.label.padEnd(24)} ${p.plain}`);
console.log(`\n  MASTER (all badges, 1 use)  ${master}\n`);
