/* vite.config.mjs — the frontend build: Vite + TypeScript (step 2 of the stack
   rewrite, see HANDOFF.md and brain/Decisions.md).

   src/ is the root. The page and the TypeScript modules (src/ts/*.ts) go
   through Vite; every other file in src/ — the classic scripts (app.js and
   the rest), the CSS, icons, fonts, vendor/ — is copied to dist/ byte for
   byte under the same name, and index.html keeps referring to them as
   before (each tag gets Vite's `vite-ignore`). So a screen can move to
   TypeScript one at a time while the rest keeps running unchanged.

   · `npm run web:build` (scripts/web.mjs) — dist/ for Tauri; writes only the
     files that changed, so cargo and the Tauri dev server see a change only
     when there is one. `npm run dev` / `tauri build` run it themselves.
   · `npm run web` — Vite's dev server at http://127.0.0.1:1420 for working on
     the page in a browser (no Tauri there: the app falls back as it always
     did in a plain browser).
   · `npm run typecheck` — tsc over src/ts (Vite only strips the types). */
import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";

const ROOT = import.meta.dirname;
const SRC = path.join(ROOT, "src");
const OUT = path.join(ROOT, "dist");

/* What is copied as is: everything except the page and the TypeScript. */
function isLegacy(rel) {
  if (rel === "index.html" || rel === "ts" || rel.startsWith("ts/")) return false;
  if (rel.split("/").some((p) => p.startsWith("."))) return false;
  return !/(^|\/)(Thumbs\.db|desktop\.ini)$/i.test(rel);
}
function legacyFiles(dir = SRC, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    const rel = path.relative(SRC, abs).split(path.sep).join("/");
    if (!isLegacy(rel)) continue;
    if (e.isDirectory()) legacyFiles(abs, out);
    else if (e.isFile()) out.push(rel);
  }
  return out;
}

/* Tags Vite would otherwise rewrite (bundle the CSS, hash the icons, warn
   about classic scripts). A module script is Vite's to handle. */
const TAG = /<(script|link|img|source|video|audio|track|embed|object|input|image|use)\b(?![^>]*\btype\s*=\s*["']?module)(?![^>]*\bvite-ignore\b)/gi;

const MIME = {
  ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".html": "text/html", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".webp": "image/webp", ".ico": "image/x-icon", ".avif": "image/avif",
  ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".otf": "font/otf",
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg", ".m4a": "audio/mp4", ".webm": "audio/webm",
  ".wasm": "application/wasm", ".txt": "text/plain", ".md": "text/markdown",
};

function legacy() {
  return {
    name: "meowave-legacy",
    transformIndexHtml: { order: "pre", handler: (html) => html.replace(TAG, (m) => `${m} vite-ignore`) },
    /* Dev server: the legacy files are served raw, ahead of Vite's own
       middleware, which would try to treat the classic scripts as modules. */
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        let rel;
        try { rel = decodeURIComponent((req.url || "/").split("?")[0]).replace(/^\/+/, ""); } catch { return next(); }
        if (!rel || rel.startsWith("@") || rel.startsWith("node_modules/") || !isLegacy(rel)) return next();
        const abs = path.join(SRC, rel);
        if (!abs.startsWith(SRC + path.sep)) return next();
        let st;
        try { st = fs.statSync(abs); } catch { return next(); }
        if (!st.isFile()) return next();
        res.setHeader("Content-Type", MIME[path.extname(abs).toLowerCase()] || "application/octet-stream");
        res.setHeader("Cache-Control", "no-cache");
        fs.createReadStream(abs).pipe(res);
      });
    },
    /* Build: the same files land in dist/ under their own names. */
    generateBundle() {
      for (const rel of legacyFiles()) this.emitFile({ type: "asset", fileName: rel, source: fs.readFileSync(path.join(SRC, rel)) });
    },
  };
}

export default defineConfig({
  root: SRC,
  base: "./",
  publicDir: false,
  clearScreen: false,
  logLevel: "info",
  plugins: [legacy()],
  server: { host: "127.0.0.1", port: 1420, strictPort: true },
  preview: { host: "127.0.0.1", port: 1421, strictPort: true },
  build: {
    outDir: OUT,
    emptyOutDir: true,
    /* src/assets/ is the app's own (badges); Vite's output goes next to it. */
    assetsDir: "bundle",
    /* The webviews Tauri runs on: WebView2 (Chromium), WKWebView (Safari 15+
       on the macOS versions Tauri 2 supports — 10.15 stops at 15.6, which is
       why class fields come out as defineProperty calls), WebKitGTK 2.4x. */
    target: ["es2022", "chrome100", "safari15"],
    /* Readable output: stack traces from the owner's machine point at real
       names, and nothing is downloaded — the files are inside the app. */
    minify: false,
    modulePreload: { polyfill: false },
    reportCompressedSize: false,
    chunkSizeWarningLimit: 8192,
  },
});
