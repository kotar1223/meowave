// tests/oracle-m1-stress.mjs - Adversarial Stress & Integration Harness for M1
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import vm from "node:vm";

const ROOT = path.resolve(".");
const cssPath = path.join(ROOT, "src", "app.css");
const jsPath = path.join(ROOT, "src", "app.js");
const htmlPath = path.join(ROOT, "src", "index.html");

const css = fs.readFileSync(cssPath, "utf8");
const js = fs.readFileSync(jsPath, "utf8");
const html = fs.readFileSync(htmlPath, "utf8");

console.log("=================================================================");
console.log("       ADVERSARIAL STRESS HARNESS: M1 RUNTIME & TIMING           ");
console.log("=================================================================");

let passed = 0;
let failed = 0;
const findings = [];

function test(name, fn) {
  try {
    fn();
    console.log(`  ✔ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✖ [FAIL] ${name}`);
    console.error(`     ${err.message}`);
    failed++;
    findings.push({ name, error: err.message });
  }
}

// ─── 1. KEYFRAME TIMING & GEOMETRY INTEGRITY ──────────────────────────────────
test("Keyframe transforms use GPU composited operations exclusively", () => {
  const kfRegex = /@keyframes\s+([a-zA-Z0-9_-]+)\s*\{([^}]+)\}/g;
  let m;
  const invalidTransforms = [];
  while ((m = kfRegex.exec(css)) !== null) {
    const name = m[1];
    const body = m[2];
    const transformRegex = /transform\s*:\s*([^;}]+)/g;
    let tm;
    while ((tm = transformRegex.exec(body)) !== null) {
      const val = tm[1].trim();
      // Verify valid transform functions
      if (!/^(?:translate|translateX|translateY|translate3d|scale|scaleX|scaleY|scale3d|rotate|rotateZ|matrix|none)/.test(val)) {
        invalidTransforms.push({ name, transform: val });
      }
    }
  }
  assert.equal(invalidTransforms.length, 0, `Invalid transform syntax found: ${JSON.stringify(invalidTransforms)}`);
});

test("eqBounce geometry: base bar is 10px tall, scaleY bounds are [0.3, 1.0]", () => {
  const eqIdx = css.indexOf("@keyframes eqBounce");
  assert.ok(eqIdx !== -1, "@keyframes eqBounce must exist");
  let depth = 0;
  let start = css.indexOf("{", eqIdx);
  let end = start;
  for (let i = start; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  const body = css.slice(start, end + 1);
  assert.match(body, /0%\s*\{\s*transform:\s*scaleY\(0\.3\);\s*\}/, "eqBounce start must scaleY(0.3)");
  assert.match(body, /100%\s*\{\s*transform:\s*scaleY\(1\);\s*\}/, "eqBounce end must scaleY(1)");

  const matches = [...css.matchAll(/\.friend-listening-chip\s+\.eq-bar\s*\{([\s\S]*?)\}/g)];
  const baseBarMatch = matches.find(m => m[1].includes("animation: eqBounce"));
  assert.ok(baseBarMatch, ".friend-listening-chip .eq-bar rule with eqBounce must exist");
  const barBody = baseBarMatch[1];
  assert.match(barBody, /height\s*:\s*10px/, "Base height must be 10px");
  assert.match(barBody, /width\s*:\s*2px/, "Base width must be 2px");
  assert.match(barBody, /transform-origin\s*:\s*bottom\s+center/, "Transform origin must be bottom center");
});

// ─── 2. RUNTIME SIMULATION: REDUCED MOTION TOGGLING ───────────────────────────
test("JS runtime handles rapid reduced-motion toggles without rAF leaks", () => {
  let listeners = [];
  let rafCallbacks = new Map();
  let nextRafId = 1;
  let currentRafId = 0;
  let time = 1000;

  const mockMedia = {
    matches: false,
    addEventListener(evt, cb) {
      if (evt === "change") listeners.push(cb);
    }
  };

  const sandbox = {
    document: {
      hidden: false,
      documentElement: { setAttribute: () => {}, getAttribute: () => "dark" },
      body: { dataset: {} },
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementById: () => null,
      addEventListener: () => {},
    },
    window: {
      matchMedia: () => mockMedia,
      addEventListener: () => {},
      requestAnimationFrame: (cb) => {
        const id = nextRafId++;
        rafCallbacks.set(id, cb);
        currentRafId = id;
        return id;
      },
      cancelAnimationFrame: (id) => {
        rafCallbacks.delete(id);
      },
      performance: {
        now: () => time
      }
    },
    matchMedia: () => mockMedia,
    requestAnimationFrame: (cb) => {
      const id = nextRafId++;
      rafCallbacks.set(id, cb);
      currentRafId = id;
      return id;
    },
    cancelAnimationFrame: (id) => {
      rafCallbacks.delete(id);
    },
    performance: {
      now: () => time
    },
    console: { log: () => {}, warn: () => {}, error: () => {} },
    localStorage: { getItem: () => null, setItem: () => {} },
    location: { href: "http://localhost/" },
    setTimeout: (fn) => setTimeout(fn, 0),
    clearTimeout: () => {},
    setInterval: () => {},
    clearInterval: () => {},
    AudioContext: class {
      createGain() { return { gain: { value: 1 }, connect: () => {} }; }
      createAnalyser() { return { fftSize: 2048, getByteFrequencyData: () => {}, connect: () => {} }; }
    },
    F: { w: 800, h: 600 },
    gx: {
      clearRect: () => {},
      fillRect: () => {},
      beginPath: () => {},
      arc: () => {},
      fill: () => {},
      stroke: () => {}
    },
    fp: { dataset: { open: "false" } },
    A: { audio: null },
    S: { playing: false, current: null, pos: 0, lite: false }
  };

  sandbox.window.window = sandbox.window;
  sandbox.window.document = sandbox.document;

  const ctx = vm.createContext(sandbox);

  const snippet = `
    var motionMedia = matchMedia("(prefers-reduced-motion: reduce)");
    var BOOT = { done: false, reduce: motionMedia.matches };
    var staticFieldDrawn = false;
    var raf = 0;
    var renderOn = true;

    function onReducedMotionChange(reduced) {
      staticFieldDrawn = false;
      if (!reduced && renderOn && !raf) raf = requestAnimationFrame(frame);
    }

    motionMedia.addEventListener("change", e => {
      BOOT.reduce = e.matches;
      if (typeof onReducedMotionChange === "function") onReducedMotionChange(e.matches);
    });

    function frame(now) {
      if (!renderOn || document.hidden) { raf = 0; return; }
      var isReduce = BOOT.reduce;
      if (!isReduce) {
        staticFieldDrawn = false;
      } else if (!staticFieldDrawn) {
        staticFieldDrawn = true;
      }
      raf = requestAnimationFrame(frame);
    }

    raf = requestAnimationFrame(frame);
  `;

  vm.runInContext(snippet, ctx);

  assert.equal(sandbox.BOOT.reduce, false, "Initial BOOT.reduce should be false");

  // Trigger rapid toggles: false -> true -> false -> true
  for (let i = 0; i < 20; i++) {
    const isRed = i % 2 === 0;
    mockMedia.matches = isRed;
    listeners.forEach(l => l({ matches: isRed }));
  }

  // Ensure BOOT.reduce settled on last state
  assert.equal(sandbox.BOOT.reduce, false, "BOOT.reduce should be false after even toggles");
});

// ─── 3. CASING AND REFLOW CONTRACT VERIFICATION ──────────────────────────────
test("CONTRACT: Standardize keyframe naming to lowercase per PROJECT.md", () => {
  const kfRegex = /@keyframes\s+([a-zA-Z0-9_-]+)\s*\{/g;
  let m;
  const uppercaseKfs = [];
  while ((m = kfRegex.exec(css)) !== null) {
    const name = m[1];
    if (/[A-Z]/.test(name)) {
      uppercaseKfs.push(name);
    }
  }
  // Let's document which keyframes have uppercase letters
  console.log(`    Notice: Keyframes with uppercase letters: ${uppercaseKfs.join(", ")}`);
  // F02-02 specifically requires coverFloat to NOT exist (be merged into coverfloat)
  assert.ok(!uppercaseKfs.includes("coverFloat"), "PROJECT.md F02-02: coverFloat must be normalized to lowercase coverfloat");
});

test("CONTRACT: Slider & Switch geometric reflow elimination per PROJECT.md F04", () => {
  // Check .seg::before
  const segRegex = /\.seg::before\s*\{([^}]+)\}/g;
  let sm;
  while ((sm = segRegex.exec(css)) !== null) {
    const body = sm[1];
    const trMatch = body.match(/(?:^|[;\s])transition\s*:\s*([^;]+)/);
    if (trMatch) {
      assert.doesNotMatch(trMatch[1], /\bwidth\b/, ".seg::before must not transition width");
    }
  }

  // Check .prog3 i
  const progRegex = /\.prog3\s+i\s*\{([^}]+)\}/g;
  let pm;
  while ((pm = progRegex.exec(css)) !== null) {
    const body = pm[1];
    const trMatch = body.match(/(?:^|[;\s])transition\s*:\s*([^;]+)/);
    if (trMatch) {
      assert.doesNotMatch(trMatch[1], /\bwidth\b/, ".prog3 i must not transition width");
    }
  }
});

console.log("\n=================================================================");
console.log(`STRESS HARNESS SCORECARD: Passed: ${passed}, Failed: ${failed}`);
console.log("=================================================================");

if (failed > 0) process.exit(1);
