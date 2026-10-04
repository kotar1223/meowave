// tests/helpers.mjs - Shared Test Utilities for Meowave E2E Test Suite
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ROOT_DIR = path.resolve(import.meta.dirname, "..");
export const PATHS = {
  root: ROOT_DIR,
  html: path.join(ROOT_DIR, "src", "index.html"),
  css: path.join(ROOT_DIR, "src", "app.css"),
  js: path.join(ROOT_DIR, "src", "app.js"),
  badgesGen: path.join(ROOT_DIR, "src", "assets", "badges", "_gen.mjs"),
};

// Cached source file contents
let _sources = null;
export function loadSources() {
  if (!_sources) {
    _sources = {
      html: fs.readFileSync(PATHS.html, "utf-8"),
      css: fs.readFileSync(PATHS.css, "utf-8"),
      js: fs.readFileSync(PATHS.js, "utf-8"),
    };
  }
  return _sources;
}

// ─── CSS Extraction & AST-like Query Helpers ─────────────────────────────────

/**
 * Extracts all @keyframes definitions from CSS
 * @param {string} css
 * @returns {Array<{ name: string, fullText: string, properties: string[], body: string }>}
 */
export function extractKeyframes(css) {
  const keyframes = [];
  const regex = /@keyframes\s+([a-zA-Z0-9_-]+)\s*\{/g;
  let match;
  while ((match = regex.exec(css)) !== null) {
    const name = match[1];
    const startIndex = match.index;
    let braceCount = 1;
    let i = match.index + match[0].length;
    while (i < css.length && braceCount > 0) {
      if (css[i] === "{") braceCount++;
      else if (css[i] === "}") braceCount--;
      i++;
    }
    const fullText = css.slice(startIndex, i);
    const body = css.slice(match.index + match[0].length, i - 1);
    
    // Extract animated properties inside keyframe stages
    const properties = [];
    const propRegex = /([a-z-]+)\s*:/g;
    let propMatch;
    while ((propMatch = propRegex.exec(body)) !== null) {
      if (!properties.includes(propMatch[1])) {
        properties.push(propMatch[1]);
      }
    }

    keyframes.push({ name, fullText, properties, body });
  }
  return keyframes;
}

/**
 * Extracts animation calls (e.g. `animation: rowin .3s ...` or `animation-name: rowin`)
 * @param {string} css
 * @returns {Array<{ selector: string, animationName: string, fullRule: string }>}
 */
export function extractAnimationInvocations(css) {
  const invocations = [];
  // Match standard CSS rules
  const ruleRegex = /([^{}@]+)\{([^}]+)\}/g;
  let ruleMatch;
  while ((ruleMatch = ruleRegex.exec(css)) !== null) {
    const selector = ruleMatch[1].trim();
    const body = ruleMatch[2];
    
    // Check for animation shorthand: animation: <name> <duration> ...
    const animRegex = /(?:^|[;\s])animation\s*:\s*([^;]+)/g;
    let animMatch;
    while ((animMatch = animRegex.exec(body)) !== null) {
      const fullRule = animMatch[1].trim();
      // First token is often name or duration. Extract identifier that isn't duration/timing
      const tokens = fullRule.split(/\s+/);
      let animName = null;
      for (const tok of tokens) {
        if (/^[a-zA-Z0-9_-]+$/.test(tok) && 
            !/^\d/.test(tok) && 
            !["infinite", "both", "forwards", "backwards", "none", "ease", "linear", "ease-in", "ease-out", "ease-in-out", "step-start", "step-end", "running", "paused"].includes(tok) &&
            !tok.startsWith("var(")) {
          animName = tok;
          break;
        }
      }
      if (animName) {
        invocations.push({ selector, animationName: animName, fullRule });
      }
    }

    // Check for animation-name
    const animNameRegex = /(?:^|[;\s])animation-name\s*:\s*([a-zA-Z0-9_-]+)/g;
    let animNameMatch;
    while ((animNameMatch = animNameRegex.exec(body)) !== null) {
      invocations.push({ selector, animationName: animNameMatch[1].trim(), fullRule: animNameMatch[0] });
    }
  }
  return invocations;
}

/**
 * Extracts CSS rules matching a selector substring or regex
 * @param {string} css
 * @param {string|RegExp} selectorPattern
 * @returns {Array<{ selector: string, body: string, declarations: Map<string, string> }>}
 */
export function extractRules(css, selectorPattern) {
  const results = [];
  const ruleRegex = /([^{}@]+)\{([^}]+)\}/g;
  let match;
  while ((match = ruleRegex.exec(css)) !== null) {
    const selector = match[1].trim();
    const body = match[2].trim();
    const matches = typeof selectorPattern === "string" 
      ? selector.includes(selectorPattern) 
      : selectorPattern.test(selector);

    if (matches) {
      const declarations = new Map();
      body.split(";").forEach(decl => {
        const colonIdx = decl.indexOf(":");
        if (colonIdx !== -1) {
          const prop = decl.slice(0, colonIdx).trim();
          const val = decl.slice(colonIdx + 1).trim();
          if (prop && val) declarations.set(prop, val);
        }
      });
      results.push({ selector, body, declarations });
    }
  }
  return results;
}

/**
 * Extracts @media blocks from CSS
 * @param {string} css
 * @param {string|RegExp} queryPattern
 * @returns {Array<{ query: string, content: string }>}
 */
export function extractMediaBlocks(css, queryPattern) {
  const blocks = [];
  const regex = /@media\s*([^{]+)\{/g;
  let match;
  while ((match = regex.exec(css)) !== null) {
    const query = match[1].trim();
    const matches = typeof queryPattern === "string" 
      ? query.includes(queryPattern) 
      : queryPattern.test(query);

    let braceCount = 1;
    let i = match.index + match[0].length;
    while (i < css.length && braceCount > 0) {
      if (css[i] === "{") braceCount++;
      else if (css[i] === "}") braceCount--;
      i++;
    }
    const content = css.slice(match.index + match[0].length, i - 1);
    if (matches) {
      blocks.push({ query, content });
    }
  }
  return blocks;
}

/**
 * Extracts custom CSS properties from a selector block
 * @param {string} css
 * @param {string} selector
 * @returns {Map<string, string>}
 */
export function extractCustomProperties(css, selector) {
  const rules = extractRules(css, selector);
  const vars = new Map();
  for (const r of rules) {
    for (const [prop, val] of r.declarations.entries()) {
      if (prop.startsWith("--")) {
        vars.set(prop, val);
      }
    }
  }
  return vars;
}

// ─── Color & Contrast Calculations (OKLCH, Hex, RGB -> WCAG AA) ─────────────

/**
 * Converts OKLCH to linear RGB
 * @param {number} L - Lightness [0..1]
 * @param {number} C - Chroma [0..0.4]
 * @param {number} H - Hue [0..360]
 * @returns {{ r: number, g: number, b: number }}
 */
export function oklchToLinearRgb(L, C, H) {
  const hRad = (H * Math.PI) / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  const r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const b_out = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

  return {
    r: Math.max(0, Math.min(1, r)),
    g: Math.max(0, Math.min(1, g)),
    b: Math.max(0, Math.min(1, b_out)),
  };
}

/**
 * Calculates relative luminance (Y in CIE 1931) from linear RGB
 * @param {{ r: number, g: number, b: number }} rgb
 * @returns {number}
 */
export function getRelativeLuminance(rgb) {
  return 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
}

/**
 * Parses OKLCH string like `oklch(24% 0.008 280)` or `oklch(96.5% 0.002 280 / .14)`
 * @param {string} str
 * @returns {{ L: number, C: number, H: number, alpha: number } | null}
 */
export function parseOklch(str) {
  if (!str) return null;
  const m = str.match(/oklch\(\s*([\d.]+)%?\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)/);
  if (!m) return null;
  const rawL = parseFloat(m[1]);
  const L = str.includes("%") || rawL > 1 ? rawL / 100 : rawL;
  const C = parseFloat(m[2]);
  const H = parseFloat(m[3]);
  const alpha = m[4] !== undefined ? parseFloat(m[4]) : 1;
  return { L, C, H, alpha };
}

/**
 * Computes WCAG 2.1 contrast ratio between two luminance values or color strings
 * (L1 + 0.05) / (L2 + 0.05) where L1 >= L2
 * @param {number|string} colorA
 * @param {number|string} colorB
 * @returns {number}
 */
export function getContrastRatio(colorA, colorB) {
  let lumA = typeof colorA === "number" ? colorA : 0;
  let lumB = typeof colorB === "number" ? colorB : 0;

  if (typeof colorA === "string") {
    const oklch = parseOklch(colorA);
    if (oklch) {
      lumA = getRelativeLuminance(oklchToLinearRgb(oklch.L, oklch.C, oklch.H));
    }
  }
  if (typeof colorB === "string") {
    const oklch = parseOklch(colorB);
    if (oklch) {
      lumB = getRelativeLuminance(oklchToLinearRgb(oklch.L, oklch.C, oklch.H));
    }
  }

  const l1 = Math.max(lumA, lumB);
  const l2 = Math.min(lumA, lumB);
  return (l1 + 0.05) / (l2 + 0.05);
}

// ─── DOM Query Helpers for Plain HTML ────────────────────────────────────────

/**
 * Checks if an element exists in HTML string
 * @param {string} html
 * @param {string} selector - e.g. '#v-home', '.navbtn', 'button[data-nav="home"]'
 * @returns {boolean}
 */
export function domHasElement(html, selector) {
  if (selector.startsWith("#")) {
    const id = selector.slice(1);
    return new RegExp(`id=["']${id}["']`).test(html);
  }
  if (selector.startsWith(".")) {
    const cls = selector.slice(1);
    return new RegExp(`class=["'][^"']*\\b${cls}\\b[^"']*["']`).test(html);
  }
  if (selector.includes("[") && selector.includes("]")) {
    const attrMatch = selector.match(/\[([a-zA-Z0-9_-]+)(?:=["']([^"']+)["'])?\]/);
    if (attrMatch) {
      const attr = attrMatch[1];
      const val = attrMatch[2];
      if (val !== undefined) {
        return new RegExp(`${attr}=["']${val}["']`).test(html);
      }
      return new RegExp(`\\b${attr}(?:=|>|\\s)`).test(html);
    }
  }
  if (selector.includes(".")) {
    const parts = selector.split(".");
    const tag = parts[0];
    const cls = parts[1];
    if (tag && cls) {
      return new RegExp(`<${tag}[^>]*class=["\'][^"\']*\\b${cls}\\b[^"\']*["\']`, "i").test(html);
    }
  }
  return html.includes(selector);
}

/**
 * Counts occurrences of elements matching simple class or tag in HTML
 * @param {string} html
 * @param {string} classOrTag
 * @returns {number}
 */
export function domCount(html, classOrTag) {
  if (classOrTag.startsWith(".")) {
    const cls = classOrTag.slice(1);
    const m = html.match(new RegExp(`class=["'][^"']*\\b${cls}\\b[^"']*["']`, "g"));
    return m ? m.length : 0;
  }
  const m = html.match(new RegExp(`<${classOrTag}\\b`, "g"));
  return m ? m.length : 0;
}

// ─── Mock Runtime Sandbox for JS Logic ───────────────────────────────────────

/**
 * Creates an isolated mock DOM & Web Audio environment in vm.createContext
 * @returns {object} { context, mockState }
 */
export function createMockEnvironment() {
  const elements = new Map();
  const listeners = new Map();

  class MockElement {
    constructor(tagName, id = "", classes = []) {
      this.tagName = tagName.toUpperCase();
      this.id = id;
      this.classList = {
        _set: new Set(classes),
        contains: (c) => this.classList._set.has(c),
        add: (...cs) => cs.forEach(c => this.classList._set.add(c)),
        remove: (...cs) => cs.forEach(c => this.classList._set.delete(c)),
        toggle: (c, force) => {
          if (force === undefined) {
            this.classList._set.has(c) ? this.classList._set.delete(c) : this.classList._set.add(c);
          } else if (force) {
            this.classList._set.add(c);
          } else {
            this.classList._set.delete(c);
          }
        }
      };
      this.attributes = new Map();
      this.style = {
        _props: new Map(),
        setProperty: (p, v) => this.style._props.set(p, v),
        getPropertyValue: (p) => this.style._props.get(p) || "",
      };
      this.offsetLeft = 8;
      this.offsetTop = 10;
      this.offsetWidth = 56;
      this.offsetHeight = 56;
      this.children = [];
    }
    setAttribute(k, v) { this.attributes.set(k, String(v)); }
    getAttribute(k) { return this.attributes.get(k) || null; }
    hasAttribute(k) { return this.attributes.has(k); }
    removeAttribute(k) { this.attributes.delete(k); }
    querySelector(s) {
      if (s.includes('aria-current="true"')) {
        return this.children.find(c => c.getAttribute("aria-current") === "true") || null;
      }
      return this.children[0] || null;
    }
    querySelectorAll() { return this.children; }
    getBoundingClientRect() {
      return { top: this.offsetTop, left: this.offsetLeft, width: this.offsetWidth, height: this.offsetHeight, bottom: this.offsetTop + this.offsetHeight, right: this.offsetLeft + this.offsetWidth };
    }
    addEventListener(ev, fn) {
      if (!listeners.has(ev)) listeners.set(ev, []);
      listeners.get(ev).push(fn);
    }
  }

  const rail = new MockElement("nav", "rail", ["rail", "pane"]);
  const navBtnHome = new MockElement("button", "", ["navbtn"]);
  navBtnHome.setAttribute("aria-current", "true");
  navBtnHome.setAttribute("data-nav", "home");
  navBtnHome.offsetLeft = 8;
  navBtnHome.offsetTop = 12;
  navBtnHome.offsetWidth = 56;
  navBtnHome.offsetHeight = 56;

  const navBtnSearch = new MockElement("button", "", ["navbtn"]);
  navBtnSearch.setAttribute("data-nav", "search");
  navBtnSearch.offsetLeft = 8;
  navBtnSearch.offsetTop = 76;
  navBtnSearch.offsetWidth = 56;
  navBtnSearch.offsetHeight = 56;

  rail.children.push(navBtnHome, navBtnSearch);
  elements.set(".rail", rail);
  elements.set("#field", new MockElement("canvas", "field"));

  const documentMock = {
    documentElement: new MockElement("html"),
    body: new MockElement("body"),
    querySelector: (s) => elements.get(s) || null,
    querySelectorAll: (s) => [elements.get(s)].filter(Boolean),
    getElementById: (id) => elements.get("#" + id) || null,
    createElement: (tag) => new MockElement(tag),
    addEventListener: (ev, fn) => {
      if (!listeners.has(ev)) listeners.set(ev, []);
      listeners.get(ev).push(fn);
    },
  };

  const windowMock = {
    document: documentMock,
    innerWidth: 1200,
    innerHeight: 800,
    devicePixelRatio: 2,
    matchMedia: (query) => ({
      matches: query.includes("prefers-reduced-motion: reduce") ? false : true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
    addEventListener: (ev, fn) => {
      if (!listeners.has(ev)) listeners.set(ev, []);
      listeners.get(ev).push(fn);
    },
    removeEventListener: () => {},
    requestAnimationFrame: (cb) => setTimeout(cb, 16),
    cancelAnimationFrame: (id) => clearTimeout(id),
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    AudioContext: class {
      constructor() { this.state = "running"; }
      createGain() { return { gain: { value: 1, setTargetAtTime: () => {} }, connect: () => {} }; }
      createBiquadFilter() { return { frequency: { value: 1000 }, gain: { value: 0 }, connect: () => {} }; }
      createPanner() { return { panningModel: "HRTF", positionX: { value: 0 }, connect: () => {} }; }
      createAnalyser() { return { fftSize: 128, getByteFrequencyData: (arr) => arr.fill(50) }; }
    },
  };

  const sandbox = {
    window: windowMock,
    document: documentMock,
    navigator: { userAgent: "Meowave-Test/1.0", hardwareConcurrency: 8, deviceMemory: 8 },
    console,
    Math,
    Set,
    Map,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Date,
    RegExp,
    Performance: globalThis.performance,
    performance: globalThis.performance,
  };

  const ctx = vm.createContext(sandbox);
  return { ctx, elements, listeners, rail, navBtnHome, navBtnSearch };
}

// ─── Test Suite Harness ──────────────────────────────────────────────────────

export class TestSuite {
  constructor(name) {
    this.name = name;
    this.tests = [];
  }

  test(title, fn) {
    this.tests.push({ title, fn });
  }

  async run(verbose = false) {
    let passed = 0;
    let failed = 0;
    const results = [];

    for (const t of this.tests) {
      const startTime = performance.now();
      try {
        await t.fn();
        const duration = (performance.now() - startTime).toFixed(2);
        passed++;
        results.push({ title: t.title, ok: true, duration });
        if (verbose) {
          console.log(`    \x1b[32m✔\x1b[0m ${t.title} (${duration}ms)`);
        }
      } catch (err) {
        const duration = (performance.now() - startTime).toFixed(2);
        failed++;
        results.push({ title: t.title, ok: false, error: err.message, duration });
        if (verbose) {
          console.log(`    \x1b[31m✖\x1b[0m ${t.title} (${duration}ms)`);
          console.log(`      \x1b[90m${err.message}\x1b[0m`);
        }
      }
    }

    return { name: this.name, passed, failed, total: this.tests.length, results };
  }
}
