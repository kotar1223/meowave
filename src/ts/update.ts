/* update.ts — the version and updates, Настройки → О приложении (was
   src/update.js; moved to TypeScript in step 2 of the stack rewrite,
   behaviour unchanged).
   The number comes from Rust (src-tauri/tauri.conf.json is the only source;
   scripts/version.mjs keeps the copies equal) and reads "Beta 3.3".
   Installed builds update from signed GitHub releases. A source checkout
   (npm run dev) checks the branch it tracks at launch and updates with
   git pull, after which Rust rebuilds dist/ (scripts/web.mjs, installing
   dependencies if package-lock.json changed) and `tauri dev` rebuilds and
   restarts the window by itself.
   Starts once app.js has run and m3.ts has started (their globals t, inv,
   toast, esc, TAURI, I18N, showModal, mwDialog; initM3 is first in main.ts). */

/** src-tauri/src/update.rs → AppVersion */
export interface AppVersion {
  version: string;
  label: string;
  source: boolean;
  branch?: string;
  commit?: string;
}
/** src-tauri/src/update.rs → UpdateInfo */
interface UpdateInfo {
  available?: boolean;
  kind?: "git" | "release" | string;
  version?: string;
  label?: string;
  new_label?: string;
  body?: string;
  behind?: number;
  schema_changed?: boolean;
}
/** src-tauri/src/update.rs → Pulled */
interface Pulled {
  version: string;
  label: string;
  schema_changed: boolean;
  rebuild: boolean;
  /** dist/ did not build: the end of scripts/web.mjs's output, or a code. */
  web_error?: string | null;
}

export interface Updater {
  check(manual?: boolean): Promise<void>;
  version(): Promise<AppVersion>;
  paint(): Promise<void>;
}

declare global {
  interface Window {
    mwUpdate?: Updater;
  }
}

const $ = (id: string) => document.getElementById(id);
const tf = (k: string, vars?: Record<string, unknown>): string => {
  let s = t(k);
  for (const [a, b] of Object.entries(vars || {})) s = s.split(`{${a}}`).join(String(b));
  return s;
};

const STRINGS = {
  ru: {
    "upd.latest": "{v} — актуальная версия",
    "upd.latest.t": "Установлена актуальная версия — {v}",
    "upd.src": "Сборка из исходников: при запуске проверяем ветку {b} на GitHub, обновление — git pull одной кнопкой, окно перезапустится само.",
    "upd.changes": "Что нового",
    "upd.behind": "Новых изменений: {n}",
    "upd.schema": "В обновлении есть изменения базы данных. После него выполните supabase/FULL_SCHEMA.sql в Supabase (SQL Editor → вставить → Run) — скрипт можно запускать повторно.",
    "upd.later": "Позже",
    "upd.pulling": "Скачиваем обновление (git pull) и собираем интерфейс…",
    "upd.pulled": "Обновлено до {v}",
    "upd.rebuild": "Пересобираем приложение — окно перезапустится само через минуту-две. Если этого не случилось, запустите npm run dev заново.",
    "upd.nothing": "Изменения не касаются самого приложения — перезапуск не нужен.",
    "upd.web": "Интерфейс из обновления не собрался, поэтому окно осталось на прежнем. Закройте Meowave и запустите npm run dev — сборка повторится, а в терминале будет видно, что не так:",
    "upd.e.node": "Не найден Node.js — нужен Node.js 20.19+ или 22.12+ (nodejs.org, версия LTS).",
    "upd.e.webtime": "Сборка интерфейса не уложилась в 15 минут.",
    "upd.e.git": "Git не найден. Установите Git или обновитесь вручную: git pull",
    "upd.e.up": "У ветки нет удалённой ветки на GitHub — выполните git pull вручную",
    "upd.e.time": "GitHub не ответил вовремя — проверьте сеть и попробуйте ещё раз",
    "upd.e.auth": "Нет доступа к репозиторию. Проверьте вход в GitHub: выполните git pull в терминале один раз",
    "upd.e.local": "git pull не прошёл: в папке есть свои изменения или коммиты, которые мешают. Ничего не тронуто:",
    "upd.e.src": "Это сборка из исходников — обновляется через git pull",
    "upd.auto": "Доступна {v} — Настройки → О приложении",
    "upd.open": "Обновить",
  },
  en: {
    "upd.latest": "{v} — up to date",
    "upd.latest.t": "You have the latest version — {v}",
    "upd.src": "Built from source: at startup we check branch {b} on GitHub; updating is a one-click git pull and the window restarts by itself.",
    "upd.changes": "What’s new",
    "upd.behind": "New changes: {n}",
    "upd.schema": "This update changes the database. Afterwards run supabase/FULL_SCHEMA.sql in Supabase (SQL Editor → paste → Run) — the script is safe to run again.",
    "upd.later": "Later",
    "upd.pulling": "Downloading the update (git pull) and building the interface…",
    "upd.pulled": "Updated to {v}",
    "upd.rebuild": "Rebuilding — the window restarts by itself in a minute or two. If it does not, run npm run dev again.",
    "upd.nothing": "The changes do not touch the app itself — no restart needed.",
    "upd.web": "The updated interface did not build, so the window keeps the previous one. Close Meowave and run npm run dev — the build runs again and the terminal shows what is wrong:",
    "upd.e.node": "Node.js was not found — Node.js 20.19+ or 22.12+ is needed (nodejs.org, LTS).",
    "upd.e.webtime": "Building the interface took longer than 15 minutes.",
    "upd.e.git": "Git was not found. Install Git or update by hand: git pull",
    "upd.e.up": "This branch has no upstream on GitHub — run git pull by hand",
    "upd.e.time": "GitHub did not answer in time — check the network and try again",
    "upd.e.auth": "No access to the repository. Check your GitHub sign-in: run git pull in a terminal once",
    "upd.e.local": "git pull failed: local changes or commits are in the way. Nothing was touched:",
    "upd.e.src": "This is a build from source — it updates with git pull",
    "upd.auto": "{v} is available — Settings → About",
    "upd.open": "Update",
  },
};

let VER: AppVersion | null = null;
async function version(): Promise<AppVersion> {
  if (VER) return VER;
  try { VER = (await inv<AppVersion>("app_version")) ?? null; } catch (e) { console.warn("app_version:", e); }
  return VER || { version: "", label: "", source: false };
}
const label = (v: Partial<AppVersion> | null | undefined): string => v?.label || v?.version || "Meowave";

async function paint(): Promise<void> {
  if (!TAURI) return;
  const v = await version();
  const el = $("appver");
  if (el && v.version) {
    const extra = v.source && v.commit ? ` · ${v.branch || "HEAD"} @ ${v.commit}` : "";
    el.textContent = `${v.label} (${v.version}${extra})`;
  }
  /* The panel's description says how this copy updates. It stays a data-i18n
     element so switching the language rewrites it like everything else. */
  const s = document.querySelector<HTMLElement>('[data-i18n="upd.s"],[data-i18n="upd.s.src"]');
  if (s && v.source) {
    for (const L of ["ru", "en"]) {
      const d = I18N[L];
      if (d) d["upd.s.src"] = (d["upd.src"] || I18N.ru["upd.src"] || "").split("{b}").join(v.branch || "—");
    }
    s.dataset.i18n = "upd.s.src";
    s.textContent = t("upd.s.src");
  }
}

/** Pulled.web_error → words (the build's own output is already worded). */
function webWhy(e: string): string {
  if (e === "node_missing") return t("upd.e.node");
  if (e === "web_timeout") return t("upd.e.webtime");
  return e.slice(-1200);
}

function why(e: unknown): string {
  const m = String((e as { message?: string } | null)?.message || e || "").replace(/^Error:\s*/, "");
  if (m === "git_missing") return t("upd.e.git");
  if (m === "no_upstream") return t("upd.e.up");
  if (m === "git_timeout") return t("upd.e.time");
  if (m === "source_checkout") return t("upd.e.src");
  if (/authentication|could not read username|permission denied|repository not found|403|401/i.test(m)) return t("upd.e.auth");
  if (/not possible to fast-forward|would be overwritten|diverg|unmerged|conflict|uncommitted/i.test(m)) return t("upd.e.local") + " " + m.slice(0, 220);
  return m.slice(0, 240);
}

function changes(u: UpdateInfo): string {
  const lines = String(u.body || "").split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 12);
  let h = "";
  if (u.kind === "git" && u.behind) h += `<p class="upd-n">${esc(tf("upd.behind", { n: u.behind }))}</p>`;
  if (lines.length) h += `<p class="upd-h">${esc(t("upd.changes"))}</p><ul class="upd-list">${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`;
  if (u.schema_changed) h += `<p class="upd-warn">${esc(t("upd.schema"))}</p>`;
  return h || `<p>${esc(tf("upd.found", { v: u.new_label || u.version }))}</p>`;
}

async function install(u: UpdateInfo): Promise<void> {
  if (u.kind !== "git") {
    toast(t("upd.installing"), 20000);
    await inv("update_install");
    return;
  }
  /* git pull, then the interface build (and npm install when the
     dependencies changed) — minutes on a slow network, not seconds. */
  const tt = toast(t("upd.pulling"), 900000, { icon: "downloading" });
  let r: Pulled | undefined;
  try { r = await inv<Pulled>("update_pull"); } finally { tt?.dismiss?.(); }
  if (!r) return;
  VER = null;
  toast(tf("upd.pulled", { v: r.label || r.version }), 5000, { icon: "check_circle" });
  const st = $("upd-state");
  if (st) st.textContent = tf("upd.pulled", { v: r.label || r.version });
  const web = r.web_error ? webWhy(r.web_error) : "";
  const note = [web ? t("upd.web") : r.rebuild ? t("upd.rebuild") : t("upd.nothing")];
  if (r.schema_changed) note.push(t("upd.schema"));
  if (typeof window.mwDialog === "function")
    window.mwDialog({
      icon: "system_update", title: tf("upd.pulled", { v: r.label || r.version }),
      body: note.map((n) => `<p>${esc(n)}</p>`).join("") + (web ? `<pre class="upd-log">${esc(web)}</pre>` : ""),
      cls: "upd-dlg", actions: [{ label: t("close"), primary: true }],
    });
  else toast([...note, web].join(" "), 12000);
}

const SKIP = "mw.upd.skip";
async function check(manual?: boolean): Promise<void> {
  if (!TAURI) return;
  const st = $("upd-state");
  if (manual && st) st.textContent = t("upd.checking");
  const v = await version();
  let u: UpdateInfo | undefined;
  try { u = await inv<UpdateInfo>("update_check"); } catch (e) {
    const msg = String((e as { message?: string } | null)?.message || e || "");
    /* No release published yet (installed builds) reads as "up to date". */
    if (/release JSON|404|not found|endpoint|failed to fetch/i.test(msg) && !v.source) {
      if (st) st.textContent = tf("upd.latest", { v: label(v) });
      if (manual) toast(tf("upd.latest.t", { v: label(v) }), 4000);
      return;
    }
    if (st) st.textContent = `${label(v)} · ${why(e)}`;
    if (manual) toast(t("upd.fail") + ": " + why(e), 6000);
    return;
  }
  if (!u?.available) {
    if (st) st.textContent = tf("upd.latest", { v: u?.label || label(v) });
    if (manual) toast(tf("upd.latest.t", { v: u?.label || label(v) }), 4000);
    return;
  }
  const info = u;
  const nv = info.new_label || info.version;
  if (st) st.textContent = tf("upd.found", { v: nv });
  /* At launch a dismissed version only gets a quiet snackbar, not the dialog
     again on every start. */
  const key = `${info.kind}:${info.version}:${info.behind || 0}`;
  if (!manual && localStorage.getItem(SKIP) === key) {
    toast(tf("upd.auto", { v: nv }), 8000, { icon: "system_update", actions: [{ label: t("upd.open"), run: () => { void check(true); } }] });
    return;
  }
  const go = async () => {
    try { await install(info); } catch (e) { toast(t("upd.fail") + ": " + why(e), 9000); }
  };
  if (typeof window.mwDialog === "function") {
    window.mwDialog({
      icon: "system_update", title: tf("upd.ask", { v: nv }), body: changes(info), cls: "upd-dlg",
      actions: [
        { label: t("upd.later"), run: () => { localStorage.setItem(SKIP, key); } },
        { label: t("upd.install"), primary: true, icon: "download", run: () => { void go(); } },
      ],
    });
    return;
  }
  if (await showModal({ title: tf("upd.ask", { v: nv }), icon: "system_update", label: String(info.body || "").slice(0, 300), input: false, confirm: t("upd.install") })) void go();
  else localStorage.setItem(SKIP, key);
}

export function initUpdate(): void {
  Object.assign(I18N.ru, STRINGS.ru);
  Object.assign(I18N.en, STRINGS.en);
  window.mwUpdate = { check, version, paint };
  void paint();
}
