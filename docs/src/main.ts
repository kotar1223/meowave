/**
 * Meowave Website - Main TypeScript Entrypoint
 * Orchestrates Material You themes, interactive player, particle field, and search.
 */

import { initThemePicker } from "./theme.js";
import { DemoPlayer, DEMO_TRACKS, DemoTrack } from "./player.js";

// Particle Field Background
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  a: number;
  s: number;
  ph: number;
  lane: number;
}

class ParticleField {
  private cv: HTMLCanvasElement;
  private gx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private particles: Particle[] = [];
  private sprites: Record<string, HTMLCanvasElement> = {};
  private raf = 0;
  private isVisible = true;
  private prefersReducedMotion = false;

  constructor(canvasId: string) {
    const el = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!el) throw new Error("Particle canvas not found");
    this.cv = el;
    const ctx = el.getContext("2d");
    if (!ctx) throw new Error("Could not acquire 2D context");
    this.gx = ctx;

    this.prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    this.resize();
    this.build();
    this.start();

    window.addEventListener("resize", () => {
      this.resize();
      this.build();
    });

    document.addEventListener("visibilitychange", () => {
      this.isVisible = !document.hidden;
      if (this.isVisible) this.start();
      else this.stop();
    });
  }

  private sprite(alpha: number): HTMLCanvasElement {
    const isDark = document.documentElement.dataset.theme !== "light";
    const k = `${isDark ? "d" : "l"}_${alpha.toFixed(2)}`;
    if (this.sprites[k]) return this.sprites[k];

    const c = document.createElement("canvas");
    c.width = 32;
    c.height = 32;
    const x = c.getContext("2d")!;
    const g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    const base = isDark ? "255, 255, 255" : "26, 24, 32";
    g.addColorStop(0, `rgba(${base}, ${alpha})`);
    g.addColorStop(0.45, `rgba(${base}, ${alpha * 0.35})`);
    g.addColorStop(1, `rgba(${base}, 0)`);
    x.fillStyle = g;
    x.beginPath();
    x.arc(16, 16, 16, 0, Math.PI * 2);
    x.fill();
    return (this.sprites[k] = c);
  }

  public resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.cv.width = this.w * dpr;
    this.cv.height = this.h * dpr;
    this.gx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  public build() {
    const count = this.prefersReducedMotion ? 0 : Math.round(Math.min(1200, (this.w * this.h) / 1400));
    this.particles = [];
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: Math.random() * this.w,
        y: Math.random() * this.h,
        vx: 0,
        vy: 0,
        a: 0.16 + Math.random() * 0.4,
        s: 0.5 + Math.random() * 0.85,
        ph: Math.random() * Math.PI * 2,
        lane: i % 9
      });
    }
  }

  private start() {
    if (!this.raf && !this.prefersReducedMotion && this.isVisible) {
      this.raf = requestAnimationFrame((t) => this.frame(t));
    }
  }

  private stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private frame(now: number) {
    const t = now / 1000;
    this.gx.clearRect(0, 0, this.w, this.h);
    const isDark = document.documentElement.dataset.theme !== "light";
    this.gx.globalCompositeOperation = isDark ? "lighter" : "source-over";

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const ang = p.ph + t * 0.32 + p.lane * 0.7;
      p.vx += Math.cos(ang) * 0.016;
      p.vy += Math.sin(ang) * 0.016;
      p.vx *= 0.965;
      p.vy *= 0.965;
      p.x += p.vx;
      p.y += p.vy;

      if (p.x < -8) p.x += this.w + 16;
      else if (p.x > this.w + 8) p.x -= this.w + 16;
      if (p.y < -8) p.y += this.h + 16;
      else if (p.y > this.h + 8) p.y -= this.h + 16;

      const sz = 2 + p.s * 2.6;
      this.gx.drawImage(this.sprite(p.a), p.x - sz, p.y - sz, sz * 2, sz * 2);
    }

    this.gx.globalCompositeOperation = "source-over";
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }
}

// Interactive Search Demo
function initSearchDemo() {
  const q = document.getElementById("demo-search-q") as HTMLInputElement;
  const flow = document.getElementById("demo-search-flow");
  const clearBtn = document.getElementById("demo-search-clear");
  const resultsContainer = document.getElementById("demo-search-results");

  if (!q || !flow || !resultsContainer) return;

  const demoCatalog: DemoTrack[] = [
    ...DEMO_TRACKS,
    {
      id: "4",
      title: "Лесник",
      artist: "Король и Шут",
      album: "Будь как дома, Путник…",
      duration: 192,
      service: "ym",
      serviceName: "Яндекс Музыка",
      art: "assets/icon.png",
      lyrics: []
    },
    {
      id: "5",
      title: "Numb",
      artist: "Linkin Park",
      album: "Meteora",
      duration: 187,
      service: "ytm",
      serviceName: "YouTube Music",
      art: "assets/icon.png",
      lyrics: []
    },
    {
      id: "6",
      title: "Город под подошвой",
      artist: "Oxxxymiron",
      album: "Сингл",
      duration: 245,
      service: "sc",
      serviceName: "SoundCloud",
      art: "assets/icon.png",
      lyrics: []
    }
  ];

  const renderResults = (query: string) => {
    const term = query.trim().toLowerCase();
    const hits = term
      ? demoCatalog.filter(
          (t) =>
            t.title.toLowerCase().includes(term) ||
            t.artist.toLowerCase().includes(term) ||
            t.album.toLowerCase().includes(term)
        )
      : demoCatalog.slice(0, 4);

    resultsContainer.innerHTML = hits.map((t) => `
      <div class="search-result-row">
        <span class="res-art"><img src="${t.art}" alt=""></span>
        <div class="res-meta">
          <b>${t.title}</b>
          <span>${t.artist} · ${t.album}</span>
        </div>
        <span class="res-svc" data-srv="${t.service}">${t.serviceName}</span>
      </div>
    `).join("") || `<p style="padding:12px;color:var(--mute);font-size:0.85rem">Ничего не найдено</p>`;
  };

  const phrases = [
    "Поиск по всем сервисам сразу…",
    "Кино — Звезда по имени Солнце",
    "Daft Punk — Get Lucky",
    "The Weeknd — Blinding Lights",
    "Linkin Park — Numb",
    "Король и Шут — Лесник"
  ];

  let phraseIdx = 0;
  let progress = 0; // 0.0 to 1.0
  let state: "filling" | "holding" | "fading" = "filling";
  let stateStart = performance.now();
  let lastTime = performance.now();
  let rafId = 0;

  function setFlowContent(phrase: string, pct: number) {
    if (!flow) return;
    flow.innerHTML = `<span class="search-fill-base">${phrase}</span>` +
      `<span class="search-fill-wipe" style="clip-path:inset(0 ${(100 - pct).toFixed(2)}% 0 0);width:100%">${phrase}</span>`;
  }

  setFlowContent(phrases[0], 0);

  function frame(now: number) {
    const dt = Math.min(100, Math.max(1, now - lastTime));
    lastTime = now;

    if (document.activeElement === q || q.value.length > 0) {
      if (flow) {
        flow.style.opacity = "0";
        flow.style.visibility = "hidden";
      }
      rafId = requestAnimationFrame(frame);
      return;
    }
    if (flow) {
      flow.style.opacity = "1";
      flow.style.visibility = "visible";
    }

    const phrase = phrases[phraseIdx % phrases.length];

    if (state === "filling") {
      // Continuous organic fluid speed without timeouts
      const organicWave = 0.00034 + 0.00024 * Math.sin(progress * Math.PI * 2.2);
      progress += organicWave * dt;
      if (progress >= 1) {
        progress = 1;
        state = "holding";
        stateStart = now;
      }
      setFlowContent(phrase, progress * 100);
    } else if (state === "holding") {
      setFlowContent(phrase, 100);
      if (now - stateStart > 1900) {
        state = "fading";
        stateStart = now;
        if (flow) {
          flow.style.transition = "opacity .28s var(--md-sys-motion-easing-standard)";
          flow.style.opacity = "0";
        }
      }
    } else if (state === "fading") {
      if (now - stateStart > 300) {
        phraseIdx = (phraseIdx + 1) % phrases.length;
        progress = 0;
        state = "filling";
        setFlowContent(phrases[phraseIdx % phrases.length], 0);
        if (flow) flow.style.opacity = "1";
      }
    }

    rafId = requestAnimationFrame(frame);
  }

  q.addEventListener("input", (e) => {
    const val = (e.target as HTMLInputElement).value;
    clearBtn?.classList.toggle("visible", val.length > 0);
    renderResults(val);
  });

  clearBtn?.addEventListener("click", () => {
    q.value = "";
    clearBtn.classList.remove("visible");
    renderResults("");
    q.focus();
  });

  renderResults("");
  rafId = requestAnimationFrame(frame);
}

// Badges Catalog Showcase
interface BadgeItem {
  id: string;
  name: { ru?: string; en?: string } | string;
  desc?: { ru?: string; en?: string } | string;
  description?: { ru?: string; en?: string } | string;
  file: string;
  rarity: string;
  unlock?: string;
  source?: string;
}

async function loadBadgesShowcase() {
  const container = document.getElementById("bstrip");
  if (!container) return;

  try {
    const res = await fetch("assets/badges/badges.json");
    if (!res.ok) return;
    const data = await res.json();
    const rawBadges: BadgeItem[] = Array.isArray(data.badges)
      ? data.badges
      : (data.achievements || []);

    // Filter out secret code badges from public view per task specification
    const badges = rawBadges.filter((b) => b.source !== "code");

    const rarityColors: Record<string, string> = {
      common: "#8b8b96",
      uncommon: "#3fb950",
      rare: "#4a9eff",
      epic: "#a855f7",
      legendary: "#f5a524",
      secret: "#e0679a"
    };

    container.innerHTML = badges.map((b) => {
      const name = typeof b.name === "object" ? b.name?.ru || b.name?.en || b.id : b.name;
      const desc = typeof b.desc === "object" ? b.desc?.ru || b.desc?.en || "" : (typeof b.description === "object" ? b.description?.ru || "" : b.desc || b.description || "");
      const col = rarityColors[b.rarity] || rarityColors.common;
      return `<div class="bchip" title="${name}${desc ? ' — ' + desc : ''}">
        <span class="bart" style="box-shadow:0 0 14px ${col}44"><img src="assets/badges/${b.file}" alt="${name}" loading="lazy"></span>
        <b style="font-size:0.8rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}</b>
      </div>`;
    }).join("");
  } catch (e) {
    console.warn("Could not load badges:", e);
  }
}

// Scroll Reveal
function initScrollReveal() {
  const reveals = document.querySelectorAll<HTMLElement>(".reveal");
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  reveals.forEach((el) => observer.observe(el));
}

// Theme Toggle Button
function initThemeToggle() {
  const btn = document.getElementById("theme");
  if (!btn) return;

  btn.addEventListener("click", () => {
    const root = document.documentElement;
    const next = root.dataset.theme === "light" ? "dark" : "light";
    root.dataset.theme = next;
    const activeColor = (document.querySelector(".palette-pill.active") as HTMLElement)?.dataset.color || "#a855f7";
    initThemePicker();
  });
}

function initNavScroll() {
  const nav = document.getElementById("nav");
  const onScroll = () => {
    if (nav) nav.dataset.scrolled = String(window.scrollY > 8);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

function initDownloadLinks() {
  const REPO = "kotar1223/meowave";
  fetch(`https://api.github.com/repos/${REPO}/releases/latest`)
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((rel) => {
      const exe = (rel.assets || []).find((a: any) => /\.exe$/i.test(a.name));
      const ver = String(rel.tag_name || "").replace(/^v/, "");
      if (ver) {
        const v1 = document.getElementById("ver");
        const v2 = document.getElementById("ver2");
        if (v1) v1.textContent = ver;
        if (v2) v2.textContent = ver;
      }
      if (exe) {
        const mb = (exe.size / 1048576).toFixed(1).replace(".", ",");
        for (const id of ["dl-main", "dl-top"]) {
          const el = document.getElementById(id) as HTMLAnchorElement;
          if (el) {
            el.href = exe.browser_download_url;
            el.removeAttribute("target");
          }
        }
        const note = document.getElementById("dl-note");
        if (note) note.textContent = `${exe.name} · ${mb} МБ`;
        for (const id of ["size-top", "size-main"]) {
          const el = document.getElementById(id);
          if (el) el.textContent = `${mb} МБ`;
        }
      }
    })
    .catch(() => {
      const note = document.getElementById("dl-note");
      if (note) note.textContent = "Открыть страницу релизов на GitHub";
    });
}

// Initialization
document.addEventListener("DOMContentLoaded", () => {
  try {
    new ParticleField("field");
  } catch (e) {
    console.warn("ParticleField init error:", e);
  }

  initNavScroll();
  initDownloadLinks();
  initThemePicker();
  new DemoPlayer();
  initSearchDemo();
  loadBadgesShowcase();
  initScrollReveal();
  initThemeToggle();
});

