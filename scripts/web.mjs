#!/usr/bin/env node
/* scripts/web.mjs — builds the webview's files: src/ (+ src/ts) → dist/.

     node scripts/web.mjs build   one build (npm run web:build; tauri build
                                  runs it as beforeBuildCommand)
     node scripts/web.mjs watch   build, then again on every change under src/
                                  (tauri dev runs it as beforeDevCommand)
     node scripts/web.mjs deps    only the dependency check below
     … --install                  first make node_modules match
                                  package-lock.json (npm run dev, the in-app
                                  update and src-tauri/build.rs use it)

   The window shows dist/ embedded into the binary (tauri's custom-protocol
   feature is always on, also in `tauri dev`), so a change reaches it only
   through a rebuild: `tauri dev` watches dist/ (build.additionalWatchFolders
   in tauri.conf.json) and rebuilds and restarts the window when it changes.
   That is why only files whose bytes changed are written, and files that are
   no longer produced are removed — cargo and the dev watcher then react to
   real changes only. build and watch produce the same bytes.

   --install keeps the owner from ever having to remember `npm install`: the
   SHA-256 of package-lock.json is stamped into node_modules/.meowave-deps
   after a successful install, and a different (or missing) stamp means
   `npm install --no-save` (never rewrites package-lock.json, so a later
   git pull is not blocked by a "local change"; never deletes node_modules
   like npm ci, which a running Tauri CLI on Windows would block).

   The configuration is vite.config.mjs; see the comment there. */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src");
const OUT = path.join(ROOT, "dist");
const args = process.argv.slice(2);
const install = args.includes("--install");
const mode = args.find((a) => !a.startsWith("--")) || "build";
if (!["build", "watch", "deps"].includes(mode)) {
  console.error("usage: node scripts/web.mjs build|watch|deps [--install]");
  process.exit(2);
}

/* Vite 8 needs Node 20.19+ or 22.12+; say so in words instead of a stack trace. */
const [maj, min] = process.versions.node.split(".").map(Number);
if (mode !== "deps" && !((maj === 20 && min >= 19) || (maj === 22 && min >= 12) || maj >= 23)) {
  console.error(`\n  Meowave: для сборки интерфейса нужен Node.js 20.19+ или 22.12+, а сейчас ${process.version}.\n  Обновите Node.js (https://nodejs.org, версия LTS) и запустите снова.\n  Meowave: building the UI needs Node.js 20.19+ or 22.12+ (this is ${process.version}).\n`);
  process.exit(1);
}

/* node_modules ↔ package-lock.json, see the header. Returns false when an
   install was needed and failed (the build may still work with what is there). */
function deps() {
  let want;
  try { want = createHash("sha256").update(fs.readFileSync(path.join(ROOT, "package-lock.json"))).digest("hex"); }
  catch { return true; }
  const stamp = path.join(ROOT, "node_modules", ".meowave-deps");
  let have = "";
  try { have = fs.readFileSync(stamp, "utf8").trim(); } catch {}
  if (have === want) return true;
  console.log("[web] package-lock.json changed — npm install (once)");
  const npmArgs = ["install", "--no-save", "--no-audit", "--no-fund", "--loglevel=error"];
  const cli = process.env.npm_execpath || "";
  const opts = { cwd: ROOT, stdio: "inherit", env: { ...process.env, npm_config_update_notifier: "false" } };
  /* Under npm (npm run dev) its own CLI script is known: run it with this
     Node. Otherwise go through the shell — on Windows npm is npm.cmd, which
     Node refuses to start without one. */
  const r = /npm-cli\.c?js$/.test(cli)
    ? spawnSync(process.execPath, [cli, ...npmArgs], opts)
    : spawnSync("npm", npmArgs, { ...opts, shell: process.platform === "win32" });
  if (r.status !== 0) {
    console.error(`\n  Meowave: npm install не прошёл (${r.error?.message || "код " + r.status}) — проверьте сеть и выполните npm install в папке проекта.\n  Meowave: npm install failed — check the network and run npm install in the project folder.\n`);
    return false;
  }
  try { fs.writeFileSync(stamp, want + "\n"); } catch {}
  return true;
}
const depsOk = install || mode === "deps" ? deps() : true;
if (mode === "deps") process.exit(depsOk ? 0 : 1);

let vite;
try { vite = await import("vite"); } catch {
  console.error("\n  Meowave: не найден Vite — выполните npm install в папке проекта и запустите снова.\n  Meowave: Vite is missing — run npm install in the project folder first.\n");
  process.exit(1);
}

function walk(dir, base = dir, out = []) {
  let list;
  try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of list) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) walk(abs, base, out);
    else out.push(path.relative(base, abs).split(path.sep).join("/"));
  }
  return out;
}
/* Tolerates a second build running at the same time (the in-app update builds
   while the watcher does): both write the same bytes, so the only thing that
   can clash is an empty folder vanishing or filling up under us. */
function pruneEmpty(dir) {
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) if (e.isDirectory()) pruneEmpty(path.join(dir, e.name));
    if (dir !== OUT && fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
  } catch {}
}

/* A failed build, readable where it ends up (a terminal, the in-app update's
   dialog, build.rs's placeholder page): no colour codes, the code frame
   first and the one-line reason last — callers keep the last lines. */
function failed(e, note = "") {
  const plain = (x) => String(x || "").replace(/\x1b\[[0-9;]*[A-Za-z]/g, "").trim();
  /* Rolldown: "Build failed with N errors:", then each error with its frame. */
  const msg = plain(e?.message || e).replace(/^Build failed with \d+ errors?:\s*/, "");
  const first = Array.isArray(e?.errors) && e.errors.length ? plain(e.errors[0].message).split("\n")[0] : "";
  const [head, ...rest] = msg.split("\n");
  if (rest.length) console.error(rest.join("\n"));
  const more = Array.isArray(e?.errors) && e.errors.length > 1 ? ` (+${e.errors.length - 1})` : "";
  console.error(`[web] build failed${note}: ${first || head}${more}`);
}

async function once() {
  const t0 = performance.now();
  const res = await vite.build({
    configFile: path.join(ROOT, "vite.config.mjs"),
    logLevel: "warn",
    mode: "production",
    build: { write: false, emptyOutDir: false, sourcemap: false },
  });
  const files = new Map();
  for (const r of Array.isArray(res) ? res : [res])
    for (const o of r.output) {
      if (o.type === "chunk") files.set(o.fileName, Buffer.from(o.code));
      else files.set(o.fileName, Buffer.from(typeof o.source === "string" ? o.source : o.source));
    }
  if (!files.has("index.html")) throw new Error("the build produced no index.html");
  fs.mkdirSync(OUT, { recursive: true });
  let wrote = 0, removed = 0;
  for (const [rel, buf] of files) {
    const abs = path.join(OUT, rel);
    let same = false;
    try { same = fs.statSync(abs).size === buf.length && fs.readFileSync(abs).equals(buf); } catch {}
    if (same) continue;
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, buf);
    wrote++;
  }
  for (const rel of walk(OUT)) if (!files.has(rel)) { fs.rmSync(path.join(OUT, rel), { force: true }); removed++; }
  pruneEmpty(OUT);
  const ms = Math.round(performance.now() - t0);
  console.log(`[web] dist/: ${files.size} files, ${wrote} written, ${removed} removed (${ms} ms)`);
}

if (mode === "build") {
  try { await once(); } catch (e) { failed(e); process.exit(1); }
  process.exit(0);
}

/* watch: keep dist/ in step with src/ for the length of `tauri dev` (which
   then rebuilds the window, see the header). */
try { await once(); } catch (e) { failed(e); }
let timer = null, busy = false, again = false;
const run = async () => {
  if (busy) { again = true; return; }
  busy = true;
  try { await once(); } catch (e) { failed(e, " (dist/ left as it was)"); }
  busy = false;
  if (again) { again = false; run(); }
};
fs.watch(SRC, { recursive: true }, (_ev, file) => {
  if (!file || /(^|[\\/])\.|~$|\.swp$/.test(String(file))) return;
  clearTimeout(timer);
  timer = setTimeout(run, 150);
});
console.log("[web] watching src/ — dist/ is rebuilt on every change");
/* Under `tauri dev` stdin is a pipe from the CLI: when the CLI goes, so do we
   (it also kills this process tree itself; this is the fallback). */
if (process.env.TAURI_ENV_PLATFORM && !process.stdin.isTTY) {
  process.stdin.on("end", () => process.exit(0));
  process.stdin.on("error", () => process.exit(0));
  process.stdin.resume();
}
