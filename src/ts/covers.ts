/* covers.ts — artwork for tracks saved without one (was src/covers.js;
   moved to TypeScript in step 2 of the stack rewrite, behaviour unchanged).
   Tracks brought over from a Yandex Music library used to arrive with no
   cover: the importer's rows never carried it. The importer is fixed in
   Rust (ymlib.rs → ym_row now sends `art`); this repairs what is already in
   the library, once per track:
   · Yandex — the covers of up to 200 tracks per request (`ym_covers`);
   · YouTube Music — the video thumbnail is the cover, no request at all.
   Ids that Yandex had no cover for are remembered, so a start-up never asks
   twice. Starts once app.js has run (TRACKS, PLAYLISTS, HISTORY, save,
   renderLib, inv). */

declare global {
  interface Window {
    mwCovers?: { repair(): Promise<number> };
  }
}

const TRIED = "mw.covers.tried";
const ytThumb = (id: string) => `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`;
const ymKey = (id: string | number | undefined) => String(id).split(":")[0]!;

function everyTrack(): MwTrack[] {
  const seen = new Set<MwTrack>(), out: MwTrack[] = [];
  const add = (x: MwTrack | undefined | null) => {
    if (x && typeof x === "object" && !seen.has(x)) { seen.add(x); out.push(x); }
  };
  try { (TRACKS || []).forEach(add); } catch { /* not loaded */ }
  try { (PLAYLISTS || []).forEach((p) => (p.tracks || []).forEach(add)); } catch { /* not loaded */ }
  /* «Недавнее» keeps its own copies of the tracks it lists. */
  try { (HISTORY || []).forEach((h) => add(h && h.tr)); } catch { /* not loaded */ }
  return out;
}

export function initCovers(): void {
  const tried = new Set<string>((() => {
    try { return JSON.parse(localStorage.getItem(TRIED) || "[]") as string[]; } catch { return []; }
  })());
  const remember = () => {
    try { localStorage.setItem(TRIED, JSON.stringify([...tried].slice(-5000))); } catch { /* storage full */ }
  };

  let running = false;
  async function repair(): Promise<number> {
    if (running || !TAURI) return 0;
    running = true;
    let changed = 0;
    try {
      const missing = everyTrack().filter((x) => !x.art && x.id && (x.s === "ym" || x.s === "ytm"));
      if (!missing.length) return 0;
      for (const x of missing)
        if (x.s === "ytm" && /^[A-Za-z0-9_-]{11}$/.test(String(x.id))) { x.art = ytThumb(String(x.id)); changed++; }
      const ids = [...new Set(missing.filter((x) => x.s === "ym" && !tried.has(ymKey(x.id))).map((x) => ymKey(x.id)))];
      for (let i = 0; i < ids.length; i += 200) {
        const part = ids.slice(i, i + 200);
        let map: Record<string, string>;
        try { map = (await inv<Record<string, string>>("ym_covers", { ids: part })) || {}; } catch (e) { console.warn("ym_covers:", e); break; }
        part.forEach((id) => tried.add(id));
        for (const x of missing)
          if (x.s === "ym" && !x.art && map[ymKey(x.id)]) { x.art = map[ymKey(x.id)]; changed++; }
      }
      remember();
      if (changed) {
        try { save(); } catch (e) { console.warn(e); }
        try { renderLib(); } catch { /* library view not mounted */ }
      }
    } finally {
      running = false;
    }
    return changed;
  }

  window.mwCovers = { repair };
  /* After the library has loaded and the first screen is drawn. */
  setTimeout(() => { repair().catch((e) => console.warn("cover repair:", e)); }, 9000);
}
