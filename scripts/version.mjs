#!/usr/bin/env node
// scripts/version.mjs — one version for the whole app.
//
//   node scripts/version.mjs            # print it; exit 1 if the copies disagree
//   node scripts/version.mjs 3.3.0      # set it everywhere
//
// The source of truth is src-tauri/tauri.conf.json (Tauri reads it for the
// window, the installers and the updater). Copies live in Cargo.toml,
// Cargo.lock, package.json and package-lock.json; this keeps them equal.
// The UI shows "Beta 3.2" for 3.2.0 (channel in src-tauri/src/update.rs).
// Numbers only (MAJOR.MINOR.PATCH): the Windows installer refuses letters.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const P = {
  conf: join(root, "src-tauri/tauri.conf.json"),
  cargo: join(root, "src-tauri/Cargo.toml"),
  lock: join(root, "src-tauri/Cargo.lock"),
  pkg: join(root, "package.json"),
  pkgLock: join(root, "package-lock.json"),
};
const read = p => { try { return readFileSync(p, "utf8"); } catch { return null; } };

const RX = {
  conf: /^(\s*"version"\s*:\s*")([^"]+)(")/m,
  cargo: /^(\[package\][\s\S]*?^version\s*=\s*")([^"]+)(")/m,
  lock: /^(\[\[package\]\]\r?\nname = "meowave"\r?\nversion = ")([^"]+)(")/m,
  pkg: /^(\{\s*"name"\s*:\s*"meowave"\s*,\s*"version"\s*:\s*")([^"]+)(")/,
  // package-lock.json: the top-level "version" and packages[""].version.
  pkgLockTop: /^(\{\s*"name"\s*:\s*"meowave"\s*,\s*"version"\s*:\s*")([^"]+)(")/,
  pkgLockRoot: /("packages"\s*:\s*\{\s*""\s*:\s*\{\s*"name"\s*:\s*"meowave"\s*,\s*"version"\s*:\s*")([^"]+)(")/,
};

function current() {
  const out = {};
  const get = (key, file, rx) => { const t = read(file); if (t == null) return; const m = t.match(rx); out[key] = m ? m[2] : "(not found)"; };
  get("tauri.conf.json", P.conf, RX.conf);
  get("Cargo.toml", P.cargo, RX.cargo);
  get("Cargo.lock", P.lock, RX.lock);
  get("package.json", P.pkg, RX.pkg);
  get("package-lock.json", P.pkgLock, RX.pkgLockTop);
  get("package-lock.json (root)", P.pkgLock, RX.pkgLockRoot);
  return out;
}

const label = v => { const [a, b, c] = v.split("."); return `Beta ${c === "0" ? `${a}.${b}` : v}`; };
const want = process.argv[2];

if (!want) {
  const v = current();
  const values = [...new Set(Object.values(v))];
  for (const [k, x] of Object.entries(v)) console.log(`${k.padEnd(26)} ${x}`);
  if (values.length !== 1) { console.error("\nVersions disagree — run: node scripts/version.mjs <x.y.z>"); process.exit(1); }
  console.log(`\n${label(values[0])} (${values[0]})`);
  process.exit(0);
}

if (!/^\d+\.\d+\.\d+$/.test(want)) {
  console.error(`"${want}" is not MAJOR.MINOR.PATCH (numbers only)`);
  process.exit(2);
}

const set = (file, rxs) => {
  const t = read(file);
  if (t == null) return;
  let next = t;
  for (const rx of rxs) {
    if (!rx.test(next)) { console.error(`version not found in ${file}`); process.exit(3); }
    next = next.replace(rx, (_, a, _v, c) => a + want + c);
  }
  if (next !== t) writeFileSync(file, next); // line endings untouched: tauri.conf.json stays CRLF
};
set(P.conf, [RX.conf]);
set(P.cargo, [RX.cargo]);
set(P.lock, [RX.lock]);
set(P.pkg, [RX.pkg]);
set(P.pkgLock, [RX.pkgLockTop, RX.pkgLockRoot]);
console.log(`${label(want)} (${want}) everywhere`);
