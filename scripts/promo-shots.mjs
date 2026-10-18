#!/usr/bin/env node
/**
 * Promo capture for the landing page (docs/assets/promo).
 *
 * Everything on screen is the real frontend running in Chromium: the demo
 * library is seeded into localStorage before the app boots, the covers and
 * 30-second previews come from Deezer's public API (no account, no keys), and
 * the only stubbed call is searchRemote — the network path the browser build
 * does not have without the Rust side. The lyrics shown in the player are
 * written for the demo; no real lyrics are copied.
 *
 * usage:
 *   node scripts/promo-shots.mjs            # screenshots + video
 *   node scripts/promo-shots.mjs --shots    # screenshots only
 *   node scripts/promo-shots.mjs --video    # video only
 *
 * env:
 *   PROMO_CHROMIUM=/usr/bin/chromium  PLAYWRIGHT_PATH=<playwright index.mjs>
 */
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const argv = new Set(process.argv.slice(2));
const wantShots = argv.has("--shots") || !argv.has("--video");
const wantVideo = argv.has("--video") || !argv.has("--shots");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "docs/assets/promo");
const PORT = Number(process.env.PROMO_PORT || 8097);
const BASE = `http://127.0.0.1:${PORT}`;
const CHROMIUM = process.env.PROMO_CHROMIUM || "/usr/bin/chromium";

async function loadPlaywright() {
  const candidates = [
    process.env.PLAYWRIGHT_PATH,
    "playwright",
    "/home/kotyar/.local/share/mise/installs/npm-playwright/1.64.0/node_modules/.mise/playwright@1.64.0/node_modules/playwright/index.mjs",
  ].filter(Boolean);
  for (const c of candidates) {
    try { return await import(c); } catch { /* try the next one */ }
  }
  throw new Error("playwright not found — set PLAYWRIGHT_PATH");
}

/* ── demo library ─────────────────────────────────────────────────────────── */

const QUERIES = ["Daft Punk", "the weeknd", "tame impala", "m83", "justice"];

/* The library reads like a real one: mixes of services, playlists with names a
   person would actually use, favourites and a history with real timestamps. */
const SERVICE_MIX = ["ytm", "sc", "ym"];

async function deezer(q, n = 7) {
  const url = `https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=${n}`;
  const r = await fetch(url, { headers: { "user-agent": "meowave-promo" } });
  if (!r.ok) throw new Error(`deezer ${r.status} for ${q}`);
  const j = await r.json();
  return (j.data || []).filter(t => t?.preview && t?.album && t?.title);
}

function toTrack(d, s) {
  const cover = d.album.cover_xl || d.album.cover_big || d.album.cover || "";
  return {
    id: `dz-${d.id}`,
    s,
    t: d.title_short || d.title,
    a: d.artist.name,
    al: d.album.title,
    d: d.duration,
    art: cover,
    mode: "local",
    url: d.preview,
  };
}

/* Demo lyrics, written for this capture and timed to the 30-second previews.
   They are seeded for every track in the demo library so the player never shows
   an empty lyric column; no real lyrics are copied. */
const HERO_LYRICS = [
  [0.5, "Neon on the wet asphalt"],
  [3.4, "Midnight keeps the city loud"],
  [6.2, "We don't talk, we just drive"],
  [9.0, "Windows down, the speakers high"],
  [12.0, "Every streetlight, passing star"],
  [15.0, "Home is anywhere you are"],
  [18.0, "Hold the wheel, I'll hold the night"],
  [21.0, "Two more hours until the light"],
  [24.0, "Chasing dawn along the coast"],
  [27.0, "One more song, and then we go"],
].map(([at, text]) => ({ at, text }));

async function buildDemo() {
  const catalog = [];
  for (const q of QUERIES) {
    const hits = await deezer(q, 7);
    hits.forEach((d, i) => catalog.push(toTrack(d, SERVICE_MIX[(catalog.length + i) % SERVICE_MIX.length])));
  }
  if (catalog.length < 18) throw new Error(`deezer returned too few tracks (${catalog.length})`);

  const hero =
    catalog.find(x => /midnight city/i.test(x.t) && /m83/i.test(x.a)) || catalog[0];
  hero.art = hero.art.replace("/500x500-", "/1000x1000-");

  const plTrack = ({ id, s, t, a, al, d, art, mode }) => ({ id, s, t, a, al, d, art, mode });
  const pls = [
    { id: "promo-night", name: "Ночной драйв", cover: null, tracks: catalog.slice(0, 6).map(plTrack) },
    { id: "promo-morning", name: "Утренний дрейф", cover: null, tracks: catalog.slice(7, 12).map(plTrack) },
    { id: "promo-code", name: "Для кода", cover: null, tracks: catalog.slice(14, 19).map(plTrack) },
  ];
  const favt = catalog.slice(2, 7).map((x, i) => ({ ...plTrack(x), fav: true, favAt: Date.now() - i * 36e5 }));
  const hist = catalog.slice(4, 11).map((x, i) => ({ at: Date.now() - i * 5400e3, tr: plTrack(x) }));

  const state = {
    lang: "ru",
    theme: "dark",
    accent: "violet",
    customAccent: "#a78bfa",
    glow: 1,
    blur: 14,
    dens: 2200,
    pspeed: 0.35,
    lite: false,
    quality: "high",
    vol: 0.8,
    fpMode: "stage",
    fpBgMode: "dynamic",
    fpGlow: 100,
    fpBlur: 75,
    lyKaraoke: "karaoke",
    fpWobble: true,
    fpZoom: "normal",
    fpDrift: true,
    ob: true,
    listen: 41 * 3600 + 1320,
    username: "kotyar",
    avatar: null,
    banner: null,
    svcOn: { ytm: true, sc: true, ym: true },
    sp: { on: false, speed: 1, rad: 100, elev: 0 },
    discord: { on: false, tmpl: "{artist} — {title} · {service}" },
    eq: [],
    preset: "flat",
    pls,
    favt,
    hist,
  };

  const lyrics = {};
  for (const x of [hero, ...catalog]) {
    lyrics[`mw.custom_lyrics.${x.s}:${x.id}`] = JSON.stringify({ source: "promo", synced: true, lines: HERO_LYRICS });
  }

  return { catalog, hero, state, lyrics };
}

/* ── page helpers ─────────────────────────────────────────────────────────── */

const initScript = (payload) => {
  localStorage.clear();
  localStorage.setItem("meowave", JSON.stringify(payload.state));
  for (const [key, value] of Object.entries(payload.lyrics)) localStorage.setItem(key, value);
  window.__promoHero = payload.hero;
};

const SEARCH_STUB = (catalog) => {
  window.searchRemote = async (q) => {
    const s = String(q || "").toLowerCase().trim();
    if (!s) return [];
    return catalog.filter(x => `${x.t} ${x.a} ${x.al}`.toLowerCase().includes(s));
  };
};

/* The browser does not draw a cursor of its own in the recording, so the video
   needs one: a small pointer plus a click ripple, driven by the same mouse
   events Playwright sends. */
const CURSOR_SCRIPT = () => {
  const put = () => {
    const c = document.createElement("div");
    c.id = "promo-cursor";
    c.style.cssText =
      "position:fixed;left:-40px;top:-40px;z-index:2147483647;pointer-events:none;width:20px;height:20px;filter:drop-shadow(0 2px 6px rgba(0,0,0,.55))";
    c.innerHTML =
      '<svg width="20" height="20" viewBox="0 0 24 24"><path d="M5.5 2.8 19 11.2l-6.1 1.6-3.2 6.4z" fill="#fff" stroke="#141318" stroke-width="1.3" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(c);
    window.__cur = c;
  };
  if (document.documentElement) put(); else addEventListener("DOMContentLoaded", put);
  addEventListener("mousemove", e => {
    const c = window.__cur;
    if (!c) return;
    c.style.left = `${e.clientX}px`;
    c.style.top = `${e.clientY}px`;
  }, true);
  addEventListener("mousedown", e => {
    const r = document.createElement("div");
    r.style.cssText = `position:fixed;left:${e.clientX}px;top:${e.clientY}px;z-index:2147483646;width:16px;height:16px;margin:-8px 0 0 -8px;border:2px solid rgba(255,255,255,.95);border-radius:50%;pointer-events:none;opacity:.85;transition:all .5s cubic-bezier(.2,.7,.2,1)`;
    document.documentElement.appendChild(r);
    requestAnimationFrame(() => {
      r.style.width = "64px";
      r.style.height = "64px";
      r.style.margin = "-32px 0 0 -32px";
      r.style.opacity = "0";
    });
    setTimeout(() => r.remove(), 650);
  }, true);
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function openApp(browser, { width, height, dpr, mobile, video, demo }) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: dpr,
    locale: "ru-RU",
    isMobile: !!mobile,
    hasTouch: !!mobile,
    ...(video ? { recordVideo: { dir: video.dir, size: { width, height } } } : {}),
  });
  await ctx.addInitScript(initScript, demo);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/index.html`, { waitUntil: "load" });
  await page.evaluate(() => window.document.fonts?.ready?.catch?.(() => {}));
  await page.waitForTimeout(900);
  await page.evaluate(SEARCH_STUB, demo.catalog);
  if (video) await page.evaluate(CURSOR_SCRIPT);
  return { ctx, page };
}

/* Chromium keeps a text selection alive after the script that made it is gone,
   and the highlight would be baked into the shot as a translucent band across
   the row. Drop it, and the focus ring with it. */
async function clearGhosts(page) {
  const ghosts = await page.evaluate(() => {
    const s = getSelection();
    const info = {
      ranges: s?.rangeCount || 0,
      text: s?.toString().slice(0, 120) || "",
      active: document.activeElement?.tagName || null,
    };
    s?.removeAllRanges();
    document.activeElement?.blur?.();
    return info;
  });
  if (ghosts.ranges || ghosts.active === "INPUT") {
    console.log(`    (cleared ${ghosts.ranges ? `selection "${ghosts.text}"` : ""}${ghosts.ranges && ghosts.active ? " + " : ""}${ghosts.active === "INPUT" ? "input focus" : ""})`);
  }
}

async function shot(page, name) {
  await clearGhosts(page);
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, type: "jpeg", quality: 88 });
  console.log(`  · ${name}`);
}

async function smoothClick(page, locator) {
  const box = await locator.boundingBox();
  if (!box) return false;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 22 });
  await sleep(160);
  await page.mouse.down();
  await sleep(70);
  await page.mouse.up();
  return true;
}

/* ── screenshots ──────────────────────────────────────────────────────────── */

async function captureStills(browser, demo) {
  console.log("screenshots →", OUT);
  const { ctx, page } = await openApp(browser, {
    width: 1440, height: 900, dpr: 1.5, mobile: false, video: null, demo,
  });

  await page.waitForTimeout(2400); // the field gathers, covers load
  await shot(page, "desktop-home.jpg");

  await page.click('[data-nav="search"]');
  await page.click("#q");
  await page.keyboard.type("daft punk", { delay: 34 });
  await page.waitForSelector("#sres .row", { timeout: 10000 });
  await page.waitForTimeout(900);
  await shot(page, "desktop-search.jpg");

  await page.click('[data-nav="library"]');
  await page.waitForTimeout(900);
  await shot(page, "desktop-library.jpg");

  /* The first .plc in the grid is the "new playlist" tile — open the real one. */
  await page.click('[data-plid="promo-night"]');
  await page.waitForTimeout(700);
  await shot(page, "desktop-playlist.jpg");

  /* Play the hero track. Chromium keeps the karaoke fill of a line that lost
     its turn as an unclipped rectangle once the lyric column has been repainted
     in place a few times during a long session; a fresh page avoids the
     artifact entirely, and the FP covers the screen anyway. */
  const pl = await openApp(browser, {
    width: 1440, height: 900, dpr: 1.5, mobile: false, video: null, demo,
  });
  await pl.page.evaluate(async () => {
    const hero = window.__promoHero;
    /* TRACKS is a top-level let binding, not a window property: reach it by
       name, the same scope the app itself uses. */
    TRACKS.push(hero);
    await window.setTrack(hero, true, false);
    window.openFP();
  });
  await pl.page.waitForFunction(() => window.S?.playing && window.S?.pos > 5.5, { timeout: 20000 });
  await pl.page.evaluate(() => { window.S.fpMode = "lyric"; window.renderFP(); });
  /* Land the shutter while the active line is mid-fill, not empty and not done. */
  await pl.page.waitForFunction(() => {
    if (!window.S?.playing) return false;
    const p = document.querySelector("#fplyr p[data-on='true']");
    if (!p) return false;
    const pct = parseFloat(getComputedStyle(p).getPropertyValue("--karaoke-pct")) || 0;
    return pct > 30 && pct < 62;
  }, { timeout: 20000 });
  await pl.page.waitForTimeout(240);
  await shot(pl.page, "desktop-player.jpg");

  await pl.page.evaluate(() => { window.S.fpMode = "stage"; window.renderFP(); });
  await pl.page.waitForTimeout(1200);
  await shot(pl.page, "desktop-player-stage.jpg");
  await pl.ctx.close();

  await page.keyboard.press("Escape"); // a stray dialog must not eat the next click
  await page.evaluate(() => window.go("settings"));
  await page.waitForTimeout(400);
  await page.click('[data-stab="look"]');
  await page.waitForTimeout(800);
  await shot(page, "desktop-settings.jpg");
  await ctx.close();

  /* Phone layout: same app, bottom rail. */
  const mob = await openApp(browser, {
    width: 390, height: 844, dpr: 3, mobile: true, video: null, demo,
  });
  await mob.page.waitForTimeout(2400);
  await shot(mob.page, "mobile-home.jpg");
  await mob.page.evaluate(async () => {
    const hero = window.__promoHero;
    TRACKS.push(hero);
    await window.setTrack(hero, true, false);
    window.S.fpMode = "lyric";
    window.openFP();
  });
  await mob.page.waitForFunction(() => window.S?.playing && window.S?.pos > 6, { timeout: 20000 });
  await mob.page.waitForTimeout(1200);
  await shot(mob.page, "mobile-player.jpg");
  await mob.ctx.close();
}

/* ── video ────────────────────────────────────────────────────────────────── */

async function captureVideo(browser, demo) {
  const dir = fs.mkdtempSync("/tmp/opencode/promo-video-");
  console.log("video →", path.join(OUT, "meowave-demo.mp4"));
  const { ctx, page } = await openApp(browser, {
    width: 1440, height: 900, dpr: 1, mobile: false, video: { dir }, demo,
  });
  await page.waitForTimeout(2600);

  /* 1. search */
  await smoothClick(page, page.locator('[data-nav="search"]'));
  await page.waitForTimeout(700);
  await page.click("#q");
  await page.keyboard.type("daft punk", { delay: 55 });
  await page.waitForSelector("#sres .row", { timeout: 10000 });
  await page.waitForTimeout(1000);

  /* 2. play the first hit */
  await smoothClick(page, page.locator("#sres .row").first());
  await page.waitForFunction(() => window.S?.playing && window.S?.pos > 0.4, { timeout: 15000 });
  await page.waitForTimeout(1400);

  /* 3. into the full player, lyric mode — the karaoke fill needs the clock.
     The target is the artwork: the centre of #np lands on its action buttons,
     and one of them ("add to playlist") opens a menu instead. */
  await page.evaluate(() => window.closeCtx?.());
  await smoothClick(page, page.locator("#np .art"));
  await page.waitForFunction(() => document.getElementById("fp")?.dataset.open === "true", { timeout: 8000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { window.S.fpMode = "lyric"; window.renderFP(); });
  await page.waitForTimeout(4200);

  /* 4. back to the stage layout, then close */
  await page.evaluate(() => { window.S.fpMode = "stage"; window.renderFP(); });
  await page.waitForTimeout(2600);
  await smoothClick(page, page.locator("#fpclose"));
  await page.waitForTimeout(1500);

  const video = page.video();
  await page.close();
  await ctx.close();
  const webm = await video.path();
  const rawOut = path.join(dir, "meowave-demo.webm");
  fs.copyFileSync(webm, rawOut);
  return rawOut;
}

function toMp4(webm) {
  const mp4 = path.join(OUT, "meowave-demo.mp4");
  const ff = process.env.FFMPEG || "/usr/bin/ffmpeg";
  execFileSync(ff, [
    "-y", "-i", webm,
    "-c:v", "libx264", "-preset", "slow", "-crf", "21",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    "-an", mp4,
  ], { stdio: "inherit" });
  return mp4;
}

/* ── main ─────────────────────────────────────────────────────────────────── */

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const { chromium } = await loadPlaywright();

  console.log("building demo library from Deezer…");
  const demo = await buildDemo();
  console.log(`  ${demo.catalog.length} tracks, hero: ${demo.hero.a} — ${demo.hero.t}`);

  const server = spawn("python3", ["-m", "http.server", String(PORT), "--directory", path.join(ROOT, "src")], {
    stdio: "ignore",
  });
  await sleep(900);

  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROMIUM,
    args: ["--autoplay-policy=no-user-gesture-required", "--hide-scrollbars"],
  });

  try {
    if (wantShots) await captureStills(browser, demo);
    if (wantVideo) {
      const webm = await captureVideo(browser, demo);
      const mp4 = toMp4(webm);
      console.log(`  · ${path.relative(ROOT, mp4)} (${(fs.statSync(mp4).size / 1e6).toFixed(1)} MB)`);
    }
  } finally {
    await browser.close();
    server.kill();
  }
  console.log("done.");
}

main().catch(e => { console.error(e); process.exit(1); });
