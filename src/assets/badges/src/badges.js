/* Meowave — badges loader + unlock UI.
   Drop into src/index.html, section `badges`. Needs a Supabase client on
   window.supabase (or pass one to Badges.init).

   <link rel="stylesheet" href="badges.css">
   <div id="badge-grid"></div>
   <form id="badge-redeem"><input id="badge-code"><button>Активировать</button></form>
   <p id="badge-msg"></p>
*/
const Badges = (() => {
  const CDN = "assets/badges/";          // where badges.json + folders live
  const state = { catalog: [], owned: new Map(), colors: {} };
  let sb = null;

  const esc = (s) =>
    String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  async function loadCatalog() {
    const res = await fetch(`${CDN}badges.json`, { cache: "no-cache" });
    if (!res.ok) throw new Error(`badges.json ${res.status}`);
    const data = await res.json();
    state.catalog = data.badges;
    state.colors = data.rarity_colors || {};
    for (const [k, v] of Object.entries(state.colors)) {
      document.documentElement.style.setProperty(`--rarity-${k}`, v);
    }
  }

  async function loadOwned() {
    state.owned.clear();
    if (!sb) return;
    const { data: { user } = {} } = await sb.auth.getUser();
    if (!user) return;
    const { data, error } = await sb
      .from("user_badges")
      .select("badge_id, earned_at, source")
      .eq("user_id", user.id);
    if (error) return console.warn("user_badges:", error.message);
    for (const r of data) state.owned.set(r.badge_id, r);
  }

  // Server recomputes thresholds. Client never decides an unlock.
  async function syncAchievements() {
    if (!sb) return [];
    const { data, error } = await sb.rpc("sync_achievements");
    if (error) { console.warn("sync_achievements:", error.message); return []; }
    return (data || []).map((r) => (typeof r === "string" ? r : r.sync_achievements));
  }

  function card(b) {
    const got = state.owned.has(b.id);
    const secret = b.hidden && !got;
    const name = secret ? "???" : b.name;
    const desc = secret ? "Скрытый бейдж" : b.description || "";
    const img = secret
      ? `${CDN}achievements/secret_achievement.svg`
      : `${CDN}${b.file}`;
    const when = got
      ? new Date(state.owned.get(b.id).earned_at).toLocaleDateString()
      : "";
    return `<figure class="badge ${got ? "is-owned" : "is-locked"}" data-rarity="${b.rarity}"
                    title="${esc(name)}${desc ? " — " + esc(desc) : ""}">
      <span class="badge-ring"><img src="${img}" alt="${esc(name)}" loading="lazy" width="44" height="44"></span>
      <figcaption>${esc(name)}${when ? `<small>${when}</small>` : ""}</figcaption>
    </figure>`;
  }

  function render(justUnlocked = []) {
    const grid = document.getElementById("badge-grid");
    if (!grid) return;
    const order = ["legendary", "secret", "epic", "rare", "uncommon", "common"];
    const list = [...state.catalog].sort((a, b) => {
      const ao = state.owned.has(a.id) ? 0 : 1, bo = state.owned.has(b.id) ? 0 : 1;
      return ao - bo || order.indexOf(a.rarity) - order.indexOf(b.rarity);
    });
    const groups = { achievement: [], code: [] };
    for (const b of list) groups[b.unlock].push(b);

    grid.innerHTML = `
      <section class="badge-group">
        <h3>Достижения <span>${groups.achievement.filter((b) => state.owned.has(b.id)).length}/${groups.achievement.length}</span></h3>
        <div class="badge-row">${groups.achievement.map(card).join("")}</div>
      </section>
      <section class="badge-group">
        <h3>Статус и косметика <span>${groups.code.filter((b) => state.owned.has(b.id)).length}/${groups.code.length}</span></h3>
        <div class="badge-row">${groups.code.map(card).join("")}</div>
      </section>`;

    for (const id of justUnlocked) {
      const el = grid.querySelector(`.badge[title^="${CSS.escape(
        (state.catalog.find((b) => b.id === id) || {}).name || ""
      )}"]`);
      el?.classList.add("just-unlocked");
    }
  }

  function msg(text, kind = "") {
    const el = document.getElementById("badge-msg");
    if (el) { el.textContent = text; el.className = kind; }
  }

  async function redeem(raw) {
    const code = (raw || "").trim().toUpperCase();
    if (!code) return;
    if (!sb) return msg("Нет соединения с сервером.", "err");

    const { data: { user } = {} } = await sb.auth.getUser();
    if (!user) return msg("Сначала войдите в аккаунт.", "err");

    msg("Проверяем…");
    const { data, error } = await sb.rpc("redeem_badge_code", { p_code: code });
    if (error) return msg("Не получилось: " + error.message, "err");

    if (!data?.ok) {
      msg({
        invalid_code: "Такого кода нет.",
        expired: "Код истёк.",
        already_used: "Код уже использован.",
      }[data?.error] || "Код не подошёл.", "err");
      return;
    }

    await loadOwned();
    render(data.unlocked || []);

    if (data.grants_all) {
      msg(`Мастер-код принят: открыто ${data.unlocked.length} бейджей. Код сгорел.`, "ok");
    } else if (data.unlocked.length) {
      const b = state.catalog.find((x) => x.id === data.unlocked[0]);
      msg(`Открыт бейдж: ${b?.name || data.unlocked[0]}`, "ok");
    } else {
      msg("Этот бейдж у вас уже есть. Код сгорел.", "ok");
    }
    document.getElementById("badge-code").value = "";
  }

  async function init(client) {
    sb = client || window.supabase || null;
    await loadCatalog();
    await loadOwned();
    render(await syncAchievements().then(async (n) => (n.length && (await loadOwned()), n)));

    const form = document.getElementById("badge-redeem");
    form?.addEventListener("submit", (e) => {
      e.preventDefault();
      redeem(document.getElementById("badge-code").value);
    });
  }

  return { init, redeem, refresh: async () => { await loadOwned(); render(); }, state };
})();

if (document.readyState !== "loading") Badges.init();
else document.addEventListener("DOMContentLoaded", () => Badges.init());
