/* profile.ts — the profile, round 8 (Beta 3.2); was profile2.js until step 2
   of the stack rewrite (HANDOFF.md).
   · Banners: a solid colour, a gradient, one of the presets or your own
     picture. Every banner you have used stays in «Мои баннеры», so swapping
     back is one click; uploaded pictures get their own file each
     (banners/<id>/banner-<time>.<ext>) instead of overwriting one, and a
     picture dropped from the list is deleted from storage.
   · A colour or a gradient is a small spec ({k:"color"|"grad"|"mesh", …})
     kept in profiles.prefs.banner through set_prefs, so friends see it too;
     a picture stays in banner_url as before. Choosing a colour clears
     banner_url, so an older build shows its default strip rather than a
     stale picture.
   · One look for your own profile and someone else's: a taller banner, a
     bigger avatar on its edge, name / badges / bio beside it, the numbers as
     a compact row and the actions in the header (see app.css «pf2»).
   app.js asks for window.MWProf only while it draws a profile or a people
   card, or after a banner picture is uploaded — each time behind a check
   that it exists — so initProfile() runs after the classic scripts
   (legacy.ts), as profile2.js ran after app.js. Reads app.js's globals
   (globals.d.ts): S, sb, sbUser, sbProfile — and writes sbProfile, a `let`
   of app.js, which a module reaches by name like a classic script did —
   save, pushPrefs, renderProfile, uploadBanner, fillProfileSettings,
   openSettings, toast, t, esc, I18N, cssUrlRaw. The HTML it writes is byte
   for byte what profile2.js wrote, including the whitespace inside the
   templates. */

import { IC } from "./ui";

/** A banner that is not a picture of its own: what profiles.prefs.banner
    and mw.banner.style hold; "img" is a picture in «Мои баннеры». */
type BannerSpec =
  | { k: "color"; c: string }
  | { k: "grad"; a: number; c: string[] }
  | { k: "mesh"; c: string[] }
  | { k: "img"; u: string };

interface ProfileApi {
  pick(): void;
  apply(s: unknown): Promise<void>;
  css(s: unknown): string;
  clean(s: unknown): BannerSpec | null;
  specOf(p: MwProfile | null | undefined): BannerSpec | null;
  attrs(s: unknown): { cls: string; style: string };
  cardBg(p: MwProfile | null | undefined): string;
  myStyle(): BannerSpec | null;
  style(): BannerSpec | null;
  imageChosen(): void;
  added(u: string | null | undefined): void;
  PRESETS: [string, BannerSpec][];
}

declare global {
  interface Window {
    MWProf?: ProfileApi;
  }
}

const STRINGS = {
  ru: {
 "pb.t":"Баннер профиля","pb.mine":"Мои баннеры","pb.mine.s":"Всё, что вы ставили, — для быстрой смены",
 "pb.presets":"Готовые","pb.color":"Сплошной цвет","pb.grad":"Свой градиент","pb.angle":"Угол","pb.apply":"Применить градиент",
 "pb.img":"Своя картинка","pb.img.s":"PNG, JPEG, WebP или GIF до 4 МБ — кадрируется 3:1","pb.upload":"Загрузить",
 "pb.none":"Без баннера","pb.set":"Баннер обновлён","pb.del":"Убрать из списка","pb.custom":"Другой цвет",
 "pb.p.aurora":"Аврора","pb.p.sunset":"Закат","pb.p.ocean":"Океан","pb.p.forest":"Лес","pb.p.neon":"Неон","pb.p.desert":"Пустыня",
 "pb.p.night":"Ночь","pb.p.rose":"Роза","pb.p.mint":"Мята","pb.p.graphite":"Графит","pb.p.peach":"Персик","pb.p.lavender":"Лаванда","pb.p.accent":"Ваш акцент",
 "pf.banner":"Баннер","pf.edit":"Изменить профиль","pf.guest":"Гость"},
  en: {
 "pb.t":"Profile banner","pb.mine":"My banners","pb.mine.s":"Everything you have used, for a quick swap",
 "pb.presets":"Presets","pb.color":"Solid colour","pb.grad":"Your gradient","pb.angle":"Angle","pb.apply":"Apply gradient",
 "pb.img":"Your picture","pb.img.s":"PNG, JPEG, WebP or GIF up to 4 MB — cropped to 3:1","pb.upload":"Upload",
 "pb.none":"No banner","pb.set":"Banner updated","pb.del":"Remove from the list","pb.custom":"Another colour",
 "pb.p.aurora":"Aurora","pb.p.sunset":"Sunset","pb.p.ocean":"Ocean","pb.p.forest":"Forest","pb.p.neon":"Neon","pb.p.desert":"Desert",
 "pb.p.night":"Night","pb.p.rose":"Rose","pb.p.mint":"Mint","pb.p.graphite":"Graphite","pb.p.peach":"Peach","pb.p.lavender":"Lavender","pb.p.accent":"Your accent",
 "pf.banner":"Banner","pf.edit":"Edit profile","pf.guest":"Guest"},
};

/* ─────────── specs ─────────── */
const HEX = /^#[0-9a-f]{6}$/i;
/* Only strings count as colours: profile2.js took anything whose String()
   looked like one, and a list inside the list (["#aabbcc"]) from someone
   else's prefs then threw in toLowerCase — and took the people list down
   with it. */
function clean(s: unknown): BannerSpec | null {
  if (!s || typeof s !== "object") return null;
  const o = s as { k?: unknown; c?: unknown; a?: unknown; u?: unknown };
  const cs = (Array.isArray(o.c) ? o.c : [o.c])
    .filter((c): c is string => typeof c === "string" && HEX.test(c))
    .slice(0, 4)
    .map(c => c.toLowerCase());
  if (o.k === "color" && cs.length) return { k: "color", c: cs[0] as string };
  if (o.k === "grad" && cs.length >= 2) {
    const a = Math.round(Number(o.a));
    return { k: "grad", a: Number.isFinite(a) ? ((a % 360) + 360) % 360 : 135, c: cs.slice(0, 3) };
  }
  if (o.k === "mesh" && cs.length >= 3) return { k: "mesh", c: cs };
  if (o.k === "img" && typeof o.u === "string" && /^(https:\/\/|data:image\/)/.test(o.u) && o.u.length < 2_000_000) return { k: "img", u: o.u };
  return null;
}
function css(spec: unknown): string {
  const s = clean(spec);
  if (!s) return "";
  if (s.k === "color") return `linear-gradient(180deg,rgb(255 255 255/.07),rgb(0 0 0/.16)),${s.c}`;
  if (s.k === "grad") return `linear-gradient(${s.a}deg,${s.c.join(",")})`;
  if (s.k === "mesh") {
    const [b, x, y, z] = s.c;
    return `radial-gradient(ellipse at 16% 20%,${x} 0,transparent 58%),radial-gradient(ellipse at 84% 26%,${y} 0,transparent 54%)`
      + (z ? `,radial-gradient(ellipse at 52% 112%,${z} 0,transparent 62%)` : "") + `,${b}`;
  }
  const u = cssUrlRaw(s.u);
  return u ? `center/cover no-repeat url('${u}')` : "";
}
const key = (s: unknown): string => JSON.stringify(clean(s));
const PRESETS: [string, BannerSpec][] = [
 ["aurora",{k:"mesh",c:["#0b1026","#2dd4bf","#6366f1","#a855f7"]}],
 ["sunset",{k:"grad",a:120,c:["#f97316","#ec4899","#8b5cf6"]}],
 ["ocean",{k:"grad",a:135,c:["#0ea5e9","#1e3a8a"]}],
 ["forest",{k:"grad",a:135,c:["#052e16","#166534","#65a30d"]}],
 ["neon",{k:"mesh",c:["#0a0a12","#f0abfc","#22d3ee","#a78bfa"]}],
 ["desert",{k:"grad",a:160,c:["#78350f","#d97706","#fde68a"]}],
 ["night",{k:"grad",a:180,c:["#0f172a","#1e1b4b","#312e81"]}],
 ["rose",{k:"grad",a:135,c:["#831843","#db2777","#f9a8d4"]}],
 ["mint",{k:"grad",a:135,c:["#064e3b","#10b981","#a7f3d0"]}],
 ["graphite",{k:"grad",a:135,c:["#111827","#374151","#6b7280"]}],
 ["peach",{k:"mesh",c:["#2a1a1f","#fb923c","#f472b6","#fde047"]}],
 ["lavender",{k:"grad",a:135,c:["#312e81","#7c3aed","#c4b5fd"]}]];
const SWATCHES = ["#0f172a","#1f2937","#7f1d1d","#b91c1c","#c2410c","#a16207","#15803d","#0f766e","#0369a1","#1d4ed8","#6d28d9","#be185d"];
function accentSpec(): BannerSpec | null {
  const rgb = getComputedStyle(document.documentElement).getPropertyValue("--accent-rgb").trim().split(/[\s,/]+/).map(Number);
  if (rgb.length < 3 || rgb.some(n => !Number.isFinite(n))) return null;
  const hx = (v: number[]): string => "#" + v.map(n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0")).join("");
  const mix = (k: number, base: number[]): number[] => rgb.map((n, i) => n * k + (base[i] as number) * (1 - k));
  return { k: "mesh", c: [hx(mix(.18, [10, 10, 18])), hx(rgb), hx(mix(.55, [255, 255, 255])), hx(mix(.6, [20, 10, 40]))] };
}

/* ─────────── state ─────────── */
const LS_STYLE = "mw.banner.style", LS_GAL = "mw.banners";
let STYLE: BannerSpec | null = null;
function readStyle(): BannerSpec | null {
  try { return clean(JSON.parse(localStorage.getItem(LS_STYLE) || "null")); } catch { return null; }
}
/** The signed-in user, or null for a guest. */
const signedUser = (): MwUser | null =>
  (typeof sb !== "undefined" && sb && typeof sbUser !== "undefined" && sbUser) || null;
/* The account's copy wins once it has been read: that is how a banner
   follows you to another machine. */
function myStyle(): BannerSpec | null {
  const pr = typeof sbProfile !== "undefined" && sbProfile && sbProfile.prefs;
  if (signedUser() && pr && Object.prototype.hasOwnProperty.call(pr, "banner")) return clean(pr.banner);
  return STYLE;
}
function setStyle(s: unknown): void {
  STYLE = clean(s);
  try {
    if (STYLE) localStorage.setItem(LS_STYLE, JSON.stringify(STYLE));
    else localStorage.removeItem(LS_STYLE);
  } catch { /* full or blocked */ }
  if (typeof sbProfile !== "undefined" && sbProfile) sbProfile.prefs = { ...(sbProfile.prefs || {}), banner: STYLE };
}
const gal = (): BannerSpec[] => {
  try {
    const a: unknown = JSON.parse(localStorage.getItem(LS_GAL) || "[]");
    return Array.isArray(a) ? a.map(x => clean(x)).filter((x): x is BannerSpec => !!x) : [];
  } catch { return []; }
};
function galSave(list: BannerSpec[]): BannerSpec[] {
  for (let l = list.slice(0, 12); ;) {
    try { localStorage.setItem(LS_GAL, JSON.stringify(l)); return l; }
    catch {
      /* quota: drop the oldest picture kept inline (a guest's data URL) */
      const i = l.map(x => x.k === "img" && x.u.startsWith("data:")).lastIndexOf(true);
      if (i < 0) { l = l.slice(0, -1); if (!l.length) return l; }
      else l.splice(i, 1);
    }
  }
}
function galAdd(spec: unknown): void {
  const s = clean(spec);
  if (!s) return;
  const k = key(s), old = gal();
  const next = [s, ...old.filter(x => key(x) !== k)];
  const kept = galSave(next);
  next.filter(x => !kept.some(y => key(y) === key(x))).forEach(x => dropFile(x));
}
/* Our own pictures in the banners bucket; anything else is not ours to delete. */
function ownPath(u: unknown): string | null {
  const m = /\/object\/public\/banners\/([^?#]+)/.exec(String(u || ""));
  const me = signedUser();
  if (!m || !me) return null;
  const p = decodeURIComponent(m[1] as string);
  return p.startsWith(me.id + "/") ? p : null;
}
function dropFile(s: BannerSpec | null | undefined): void {
  if (!s || s.k !== "img") return;
  const p = ownPath(s.u);
  if (!p) return;
  const cur = String((typeof sbProfile !== "undefined" && sbProfile?.banner_url) || S.banner || "");
  if (ownPath(cur) === p) return;
  /* ownPath() found a signed-in user, so sb is there. */
  sb!.storage.from("banners").remove([p]).catch(() => {});
}

/* ─────────── applying ─────────── */
async function setBannerUrl(u: string | null): Promise<void> {
  S.banner = u || "";
  if (typeof sbProfile !== "undefined" && sbProfile) sbProfile = { ...sbProfile, banner_url: u || null };
  save();
  const me = signedUser();
  if (me) {
    const { error } = await sb!.from("profiles").upsert({ id: me.id, banner_url: u || null });
    if (error) console.warn("banner:", error.message || error);
  }
}
async function apply(spec: unknown): Promise<void> {
  const s = clean(spec);
  if (s && s.k === "img") { setStyle(null); await setBannerUrl(s.u); }
  else { setStyle(s); await setBannerUrl(null); }
  if (s) galAdd(s);
  try { pushPrefs(); } catch { /* as profile2.js: the banner is applied either way */ }
  try { renderProfile(); } catch { /* the profile screen may not be built yet */ }
  try { fillProfileSettings(); } catch { /* nor the settings */ }
  toast(t("pb.set"));
}
/* Called by app.js's uploadImage: a picture replaces a colour at once, and
   the uploaded file joins «Мои баннеры». */
function imageChosen(): void {
  if (myStyle()) { setStyle(null); try { pushPrefs(); } catch { /* see apply() */ } }
}
function added(u: string | null | undefined): void { if (u) galAdd({ k: "img", u }); }

/* ─────────── rendering ─────────── */
/* The banner of a profile row: {cls, style} for the .banner element. */
function specOf(p: MwProfile | null | undefined): BannerSpec | null {
  const me = signedUser();
  const own = me && p && String(p.id || "") === String(me.id);
  return own ? myStyle() : clean(p && p.prefs && p.prefs.banner);
}
function attrs(s: unknown): { cls: string; style: string } {
  const c = css(s);
  return c ? { cls: " has-style", style: ` style="background:${esc(c)}"` } : { cls: "", style: "" };
}
function cardBg(p: MwProfile | null | undefined): string {
  const c = css(specOf(p));
  return c ? `background:${esc(c)}` : "";
}

/* ─────────── the picker ─────────── */
function tile(s: unknown, label: string, extra = ""): string {
  const c = css(s);
  return `<button type="button" class="pb-tile" data-pb='${esc(JSON.stringify(clean(s)))}' style="background:${esc(c)}" title="${esc(label||"")}" aria-label="${esc(label||"")}">${extra}${label?`<span class="pb-l">${esc(label)}</span>`:""}</button>`;
}
/** The banner shown now: the spec, or the picture in banner_url. */
const current = (): BannerSpec | null => myStyle() || (S.banner ? { k: "img", u: S.banner } : null);
function body(): string {
  const mine = gal(), cur = key(current());
  const acc = accentSpec();
  const mark = (h: string): string => h.replace(/data-pb='([^']*)'/g, (m, j: string) => m + (j === esc(cur) ? ' aria-current="true"' : ""));
  return mark(`<div class="pb">
  <div class="pb-prev"><span class="pb-prev-b"></span></div>
  ${mine.length?`<section><div class="pb-h"><b>${esc(t("pb.mine"))}</b><small>${esc(t("pb.mine.s"))}</small></div>
   <div class="pb-grid">${mine.map((s,i)=>`<span class="pb-wrap">${tile(s,"")}<button type="button" class="pb-x" data-pbdel="${i}" title="${esc(t("pb.del"))}" aria-label="${esc(t("pb.del"))}">${IC("close",14)}</button></span>`).join("")}</div></section>`:""}
  <section><div class="pb-h"><b>${esc(t("pb.presets"))}</b></div>
   <div class="pb-grid">${acc?tile(acc,t("pb.p.accent")):""}${PRESETS.map(([id,s])=>tile(s,t("pb.p."+id))).join("")}</div></section>
  <section><div class="pb-h"><b>${esc(t("pb.color"))}</b></div>
   <div class="pb-sw">${SWATCHES.map(c=>`<button type="button" class="pb-dot" data-pb='${esc(JSON.stringify({k:"color",c}))}' style="background:${c}" aria-label="${c}"></button>`).join("")}
    <label class="pb-dot pb-own" title="${esc(t("pb.custom"))}">${IC("colorize",16)}<input type="color" data-pbcolor value="#6d28d9"></label></div></section>
  <section><div class="pb-h"><b>${esc(t("pb.grad"))}</b></div>
   <div class="pb-gr"><input type="color" data-g="0" value="#6366f1"><input type="color" data-g="1" value="#ec4899"><input type="color" data-g="2" value="#0b1026">
    <label class="pb-ang"><span>${esc(t("pb.angle"))}</span><input type="range" min="0" max="360" step="5" value="135" data-g="a"><output>135°</output></label>
    <button type="button" class="btn sm" data-pbgrad>${IC("gradient",16)}<span>${esc(t("pb.apply"))}</span></button></div></section>
  <section class="pb-img"><div class="pb-h"><b>${esc(t("pb.img"))}</b><small>${esc(t("pb.img.s"))}</small></div>
   <div class="pb-row"><button type="button" class="btn sm" data-pbup>${IC("upload",16)}<span>${esc(t("pb.upload"))}</span></button>
    <button type="button" class="btn sm ghost" data-pbnone>${IC("hide_image",16)}<span>${esc(t("pb.none"))}</span></button></div>
   <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden data-pbfile></section>
 </div>`);
}
let DLG: MwDialogHandle | null = null;
function pick(): void {
  if (typeof window.mwDialog !== "function") { document.getElementById("prof-ban-input")?.click(); return; }
  DLG?.close();
  const d = DLG = window.mwDialog({ icon: "palette", title: t("pb.t"), body: body(), cls: "pb-dlg wide", actions: [{ label: t("close"), primary: true }] });
  const root = d.body;
  const prev = () => root.querySelector<HTMLElement>(".pb-prev-b");
  const show = (s: unknown): void => { const p = prev(); if (p) p.style.background = css(s) || ""; };
  const gradSpec = (): BannerSpec | null => {
    const g = (i: number | string) => root.querySelector<HTMLInputElement>(`[data-g="${i}"]`)?.value;
    return clean({ k: "grad", a: Number(g("a")), c: [g(0), g(1), g(2)] });
  };
  show(current());
  const repaint = (): void => { root.innerHTML = body(); wire(); };
  function wire(): void {
    show(current());
    root.querySelectorAll<HTMLElement>("[data-pb]").forEach(b => {
      const s: unknown = (() => { try { return JSON.parse(b.dataset.pb ?? ""); } catch { return null; } })();
      b.addEventListener("pointerenter", () => show(s));
      b.addEventListener("pointerleave", () => show(current()));
      b.addEventListener("click", async () => { await apply(s); repaint(); });
    });
    root.querySelectorAll<HTMLElement>("[data-pbdel]").forEach(b => b.addEventListener("click", e => {
      e.stopPropagation();
      const l = gal(), i = Number(b.dataset.pbdel), [gone] = l.splice(i, 1);
      galSave(l); dropFile(gone); repaint();
    }));
    root.querySelector<HTMLInputElement>("[data-pbcolor]")?.addEventListener("change", async e => {
      await apply({ k: "color", c: (e.target as HTMLInputElement).value }); repaint();
    });
    root.querySelectorAll<HTMLInputElement>("[data-g]").forEach(i => i.addEventListener("input", () => {
      const o = root.querySelector(".pb-ang output");
      if (o) o.textContent = (root.querySelector<HTMLInputElement>('[data-g="a"]')?.value || 0) + "°";
      show(gradSpec());
    }));
    root.querySelector("[data-pbgrad]")?.addEventListener("click", async () => { await apply(gradSpec()); repaint(); });
    const file = root.querySelector<HTMLInputElement>("[data-pbfile]");
    root.querySelector("[data-pbup]")?.addEventListener("click", () => file?.click());
    file?.addEventListener("change", async () => {
      const f = file.files?.[0];
      file.value = "";
      if (!f) return;
      d.close();
      await uploadBanner(f);
      try { fillProfileSettings(); } catch { /* see apply() */ }
    });
    root.querySelector("[data-pbnone]")?.addEventListener("click", async () => {
      setStyle(null); await setBannerUrl(null);
      try { pushPrefs(); } catch { /* see apply() */ }
      try { renderProfile(); } catch { /* see apply() */ }
      repaint();
    });
  }
  wire();
}

/* Settings → Profile → Banner and the profile's own «Баннер» open the same
   picker; «Изменить профиль» opens Settings → Profile. */
function onBannerClick(e: MouseEvent): void {
  const b = e.target instanceof Element && e.target.closest("#set-ban-pick,[data-pfbanner]");
  if (!b) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  pick();
}
function onEditClick(e: MouseEvent): void {
  if (e.target instanceof Element && e.target.closest("[data-pfedit]")) {
    e.preventDefault();
    try { openSettings("prof"); } catch { /* the settings are not built yet */ }
  }
}

export function initProfile(): void {
  Object.assign(I18N.ru, STRINGS.ru);
  Object.assign(I18N.en, STRINGS.en);
  STYLE = readStyle();
  document.addEventListener("click", onBannerClick, true);
  document.addEventListener("click", onEditClick);
  window.MWProf = { pick, apply, css, clean, specOf, attrs, cardBg, myStyle, style: () => myStyle(), imageChosen, added, PRESETS };
}
