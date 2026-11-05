/* aura.ts — the home background (was src/aura.js; moved to TypeScript in
   step 2 of the stack rewrite, behaviour unchanged).

   Round 8 (Beta 3.2): "the wave is still jerky", "full optimisation, the
   wave eats a lot".
   · «Фон главной»: Волна (the particle field, unchanged) · Аура · Выкл.
     Аура is a few soft blobs in the accent's hues on a tiny canvas — an
     eighth of the window per side — stretched by CSS: the bilinear upscale is
     the blur, so a frame is four radial gradients on ~240×135 pixels instead
     of thousands of sprites and a physics loop. It breathes with the bass,
     mids and treble like the wave does. Выкл stops every background
     animation, the haze included: nothing under the glass panels moves, so
     their backdrop blur is never recomputed.
   · «Частота фона»: 60 or 30 updates a second for whichever background
     runs. Each update makes every glass panel above re-blur; 30 halves that.
   Hooked from app.js's frame() (MWAura.bg / MWAura.on / MWAura.frame) and
   resize(). Uses app.js globals: S, AB, BOOT, I18N, t, seg, setSeg,
   setParticlesEnabled, resize, draw, fieldAccent, oklchOf, oklchLin. */

export type BgMode = "wave" | "aura" | "off";
export type TabsMode = "move" | "off";

export interface Aura {
  bg: BgMode;
  on: boolean;
  fps: 30 | 60;
  tabs: TabsMode;
  frame(dt: number, lvl?: number): void;
  resize(): void;
  set(v: string): void;
  setFps(v: string | number): void;
  setTabs(v: string): void;
}

declare global {
  interface Window {
    MWAura?: Aura;
  }
}

type Rgb = [number, number, number];

const LSM = "mw.bg.mode", LSF = "mw.bg.fps", LST = "mw.bg.tabs";
const rd = (k: string, d: string): string => { try { return localStorage.getItem(k) || d; } catch { return d; } };
const wr = (k: string, v: string): void => { try { localStorage.setItem(k, v); } catch { /* storage full or off */ } };
const MODES: readonly BgMode[] = ["wave", "aura", "off"];
const isMode = (v: string): v is BgMode => (MODES as readonly string[]).includes(v);

const STRINGS = {
  ru: {
    "bg.mode": "Фон главной", "bg.mode.s": "Волна из частиц, лёгкая аура или спокойный фон без анимации",
    "bg.wave": "Волна", "bg.aura": "Аура", "bg.off": "Выкл",
    "bg.fps": "Частота фона", "bg.fps.s": "30 кадров вдвое легче для видеокарты: стеклянные панели реже пересчитывают размытие",
    "bg.tabs": "Фон во вкладках", "bg.tabs.s": "В поиске, медиатеке и других вкладках: фон двигается (панели без размытия — так он не тормозит) или скрыт",
    "bg.tabs.move": "Двигается", "bg.tabs.off": "Выключен",
  },
  en: {
    "bg.mode": "Home background", "bg.mode.s": "A particle wave, a light aura or a calm still background",
    "bg.wave": "Wave", "bg.aura": "Aura", "bg.off": "Off",
    "bg.fps": "Background frame rate", "bg.fps.s": "30 fps is half the GPU work: the glass panels re-blur half as often",
    "bg.tabs": "Background in tabs", "bg.tabs.s": "In search, the library and the other tabs: the background keeps moving (panels without blur, so it stays light) or is hidden",
    "bg.tabs.move": "Moving", "bg.tabs.off": "Off",
  },
};

/* palette: the accent's hue at four lightness/hue offsets, chroma capped like
   every colour the app derives itself (no neon) */
function tone(rgb: Rgb, dh: number, C: number, L: number): Rgb {
  const [, c0, h] = oklchOf(rgb);
  let c = Math.max(0.035, Math.min(c0, C));
  let lin = oklchLin(L, c, h + dh);
  for (let i = 0; i < 12 && lin.some((v) => v < -1e-4 || v > 1 + 1e-4); i++) { c *= 0.82; lin = oklchLin(L, c, h + dh); }
  return lin.map((v) => {
    v = Math.max(0, Math.min(1, v));
    return 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
  }) as Rgb;
}

interface Blob {
  /** position, radius (× the longer side), drift x/y, speed x/y, phase, band, hue offset */
  x: number; y: number; r: number; ax: number; ay: number; fx: number; fy: number; ph: number;
  band: "bass" | "mid" | "high" | "lvl"; dh: number;
}
const BLOBS: readonly Blob[] = [
  { x: 0.24, y: 0.3, r: 0.62, ax: 0.12, ay: 0.09, fx: 0.11, fy: 0.07, ph: 0, band: "bass", dh: 0 },
  { x: 0.8, y: 0.7, r: 0.56, ax: 0.1, ay: 0.11, fx: 0.08, fy: 0.1, ph: 1.7, band: "mid", dh: 0.66 },
  { x: 0.64, y: 0.16, r: 0.42, ax: 0.13, ay: 0.08, fx: 0.13, fy: 0.09, ph: 3.1, band: "high", dh: -0.72 },
  { x: 0.3, y: 0.84, r: 0.48, ax: 0.09, ay: 0.09, fx: 0.06, fy: 0.12, ph: 4.4, band: "lvl", dh: 0.2 },
];
const DARK = { L: [0.54, 0.48, 0.62, 0.38], C: 0.11, A: [0.58, 0.5, 0.42, 0.6] };
const LIGHT = { L: [0.86, 0.82, 0.9, 0.78], C: 0.08, A: [0.55, 0.5, 0.42, 0.5] };

export function initAura(): void {
  Object.assign(I18N.ru, STRINGS.ru);
  Object.assign(I18N.en, STRINGS.en);

  const saved = rd(LSM, "wave");
  /* Round 10: "I don't want the wave to stop in the tabs — optimise it or turn
     it off there". Round 9 held the field still behind other screens (each
     update re-blurred every glass panel above it); a frozen wave read as a
     broken one. Now it either moves there — at 30 updates a second, with the
     panels' backdrop blur dropped (app.css html[data-tw="move"]) so a frame
     costs one canvas, not fifty blur passes — or is not there at all. */
  const M: Aura = {
    bg: isMode(saved) ? saved : "wave",
    on: false,
    fps: rd(LSF, "60") === "30" ? 30 : 60,
    tabs: rd(LST, "move") === "off" ? "off" : "move",
    frame: () => {},
    resize: () => {},
    set: () => {},
    setFps: () => {},
    setTabs: () => {},
  };
  document.documentElement.dataset.tw = M.tabs;

  /* the canvas sits with the field, under everything */
  const cv = document.createElement("canvas");
  cv.id = "aura";
  cv.setAttribute("aria-hidden", "true");
  const anchor = document.getElementById("fieldgl") || document.getElementById("field");
  if (anchor) anchor.after(cv);
  else document.body.prepend(cv);
  const g = cv.getContext("2d", { alpha: true })!;
  let W = 0, H = 0;
  function size(): void {
    const w = Math.max(96, Math.ceil(innerWidth / 8)), h = Math.max(54, Math.ceil(innerHeight / 8));
    if (w !== W || h !== H) { W = cv.width = w; H = cv.height = h; }
  }

  interface Palette { c: Rgb[]; a: number[] }
  let pal: Palette | null = null, palT = 0, palKey = "", tm = 0;
  let tgt: (Palette & { light: boolean }) | null = null;
  function target(): void {
    const light = document.documentElement.dataset.theme === "light", P = light ? LIGHT : DARK;
    let rgb: Rgb = [200, 200, 220];
    try { rgb = fieldAccent(); } catch { /* app.js not ready: neutral */ }
    const key = rgb.join(",") + (light ? "l" : "d");
    if (key === palKey && tgt) return;
    palKey = key;
    tgt = { light, c: BLOBS.map((b, i) => tone(rgb, b.dh, P.C, P.L[i]!)), a: P.A };
    if (!pal) pal = { c: tgt.c.map((c) => c.slice() as Rgb), a: tgt.a.slice() };
  }

  function paint(dt: number, lvl: number): void {
    if (!W) size();
    const t0 = performance.now();
    if (t0 - palT > 500 || !tgt) { palT = t0; target(); }
    const P = pal!, T = tgt!;
    const k = dt > 0 ? 1 - Math.exp(-dt * 2.5) : 1;
    for (let i = 0; i < BLOBS.length; i++) {
      const a = P.c[i]!, b = T.c[i]!;
      for (let j = 0; j < 3; j++) a[j]! += (b[j]! - a[j]!) * k;
      P.a[i]! += (T.a[i]! - P.a[i]!) * k;
    }
    const ab = typeof AB === "object" ? AB : { bass: 0, mid: 0, high: 0, lvl: 0, beat: 0 };
    const sp = (typeof S === "object" && +(S.pspeed ?? 0)) || 0.35;
    tm += dt * (0.16 + 0.34 * sp) * (1 + ab.mid * 0.8);
    g.clearRect(0, 0, W, H);
    const R = Math.max(W, H);
    for (let i = 0; i < BLOBS.length; i++) {
      const b = BLOBS[i]!, band = b.band === "lvl" ? lvl : ab[b.band] || 0;
      const x = (b.x + b.ax * Math.sin(tm * b.fx * 6.283 + b.ph)) * W;
      const y = (b.y + b.ay * Math.cos(tm * b.fy * 6.283 + b.ph * 1.3)) * H;
      const r = b.r * R * (1 + 0.22 * band + 0.1 * ab.beat);
      const al = Math.min(0.9, P.a[i]! * (0.78 + 0.5 * band + 0.18 * ab.beat));
      const [cr, cg, cb] = P.c[i]!.map(Math.round) as Rgb;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(${cr},${cg},${cb},${al})`);
      gr.addColorStop(0.5, `rgba(${cr},${cg},${cb},${al * 0.42})`);
      gr.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }

  /* called by app.js's frame() at the background's update rate; dt=0 is the
     one static frame for reduced motion */
  M.frame = (dt, lvl) => paint(dt, lvl || 0);
  M.resize = () => { size(); if (typeof BOOT === "object" && BOOT.reduce) paint(0, 0); };

  function apply(first: boolean): void {
    const de = document.documentElement;
    de.dataset.bg = M.bg;
    M.on = M.bg === "aura";
    const want = M.bg === "wave";
    try {
      if (!want) {
        setParticlesEnabled(false);
        if (!first) draw(0);
        resize();
      } else if (!first) {
        /* resize() restores the canvases and rebuilds the emptied field */
        setParticlesEnabled(true);
        resize();
      }
    } catch { /* app.js without the field (tests): nothing to switch */ }
    if (M.on) { size(); paint(0, 0); }
    document.querySelectorAll(".bg-wave-only").forEach((f) => f.classList.toggle("bg-na", !want));
  }
  M.set = (v) => { if (!isMode(v) || v === M.bg) return; M.bg = v; wr(LSM, v); apply(false); };
  M.setFps = (v) => { M.fps = +v === 30 ? 30 : 60; wr(LSF, String(M.fps)); };
  M.setTabs = (v) => {
    M.tabs = v === "off" ? "off" : "move";
    wr(LST, M.tabs);
    document.documentElement.dataset.tw = M.tabs;
    if (document.getElementById("bgtabs")) setSeg("bgtabs", M.tabs);
  };

  /* settings: three rows above the wave's own controls (Вид) */
  function inject(): void {
    const dens = document.getElementById("dens"), f = dens?.closest(".field");
    if (!f || document.getElementById("bgmode")) return;
    const row = (id: string, lab: string, sub: string, btns: string): HTMLDivElement => {
      const d = document.createElement("div");
      d.className = "field";
      d.innerHTML = `<div><label data-i18n="${lab}">${t(lab)}</label><small data-i18n="${sub}">${t(sub)}</small></div>
<div class="seg" id="${id}" role="group">${btns}</div>`;
      return d;
    };
    const a = row("bgmode", "bg.mode", "bg.mode.s", MODES.map((m) => `<button data-v="${m}" data-i18n="bg.${m}">${t("bg." + m)}</button>`).join(""));
    const b = row("bgfps", "bg.fps", "bg.fps.s", `<button data-v="60">60</button><button data-v="30">30</button>`);
    const c = row("bgtabs", "bg.tabs", "bg.tabs.s",
      `<button data-v="move" data-i18n="bg.tabs.move">${t("bg.tabs.move")}</button><button data-v="off" data-i18n="bg.tabs.off">${t("bg.tabs.off")}</button>`);
    f.before(a, b, c);
    /* density and glow only mean something for the wave */
    for (const id of ["dens", "glow"]) document.getElementById(id)?.closest(".field")?.classList.add("bg-wave-only");
    seg("bgmode", (v) => M.set(v));
    seg("bgfps", (v) => M.setFps(v));
    seg("bgtabs", (v) => M.setTabs(v));
    setSeg("bgmode", M.bg); setSeg("bgfps", M.fps); setSeg("bgtabs", M.tabs);
  }

  /* dimmed behind other screens exactly like the field: go() toggles .dim on
     the field's canvases, the aura follows */
  const fg = document.getElementById("fieldgl") || document.getElementById("field");
  if (fg) {
    const sync = () => cv.classList.toggle("dim", fg.classList.contains("dim"));
    sync();
    new MutationObserver(sync).observe(fg, { attributes: true, attributeFilter: ["class"] });
  }

  window.MWAura = M;
  inject();
  apply(true);
  addEventListener("resize", () => { if (M.on) size(); });
}
