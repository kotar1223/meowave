// tests/oracle-m1-animation.mjs - Adversarial Oracle for M1 Animation Engine
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const cssPath = path.resolve("src/app.css");
const jsPath = path.resolve("src/app.js");

const rawCss = fs.readFileSync(cssPath, "utf8");
const rawJs = fs.readFileSync(jsPath, "utf8");

// Strip comments from CSS for clean parsing
function stripCssComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

const cleanCss = stripCssComments(rawCss);

console.log("=================================================================");
console.log("       ADVERSARIAL ORACLE: M1 ANIMATION & REFLOW VERIFICATION    ");
console.log("=================================================================");

const results = {
  passed: 0,
  failed: 0,
  findings: []
};

function check(name, fn) {
  try {
    fn();
    console.log(`  ✔ [PASS] ${name}`);
    results.passed++;
  } catch (err) {
    console.error(`  ✖ [FAIL] ${name}`);
    console.error(`     Error: ${err.message}`);
    results.failed++;
    results.findings.push({ name, error: err.message });
  }
}

// ─── 1. KEYFRAME EXTRACTION & CASING NORMALIZATION ────────────────────────────
const keyframeMap = new Map(); // lowercase -> { originalName, count, bodies: [] }
const allKeyframes = []; // list of { name, body, fullText }
const keyframeRegex = /@keyframes\s+([a-zA-Z0-9_-]+)\s*\{/g;
let match;

while ((match = keyframeRegex.exec(cleanCss)) !== null) {
  const name = match[1];
  let braceCount = 1;
  let i = match.index + match[0].length;
  while (i < cleanCss.length && braceCount > 0) {
    if (cleanCss[i] === "{") braceCount++;
    else if (cleanCss[i] === "}") braceCount--;
    i++;
  }
  const body = cleanCss.slice(match.index + match[0].length, i - 1);
  const fullText = cleanCss.slice(match.index, i);

  allKeyframes.push({ name, body, fullText });
  const lower = name.toLowerCase();
  if (!keyframeMap.has(lower)) {
    keyframeMap.set(lower, { originalNames: [name], count: 1, bodies: [body] });
  } else {
    const entry = keyframeMap.get(lower);
    entry.originalNames.push(name);
    entry.count++;
    entry.bodies.push(body);
  }
}

check("Keyframe Deduplication (No duplicate keyframe names, case-sensitive or case-insensitive)", () => {
  const duplicates = [];
  for (const [lower, data] of keyframeMap.entries()) {
    if (data.count > 1) {
      duplicates.push({ lower, names: data.originalNames });
    }
  }
  assert.equal(
    duplicates.length,
    0,
    `Found duplicate keyframe definitions: ${JSON.stringify(duplicates)}`
  );
});

check("Keyframe Casing: No uppercase 'rowIn' exists", () => {
  const rowIn = allKeyframes.find(k => k.name === "rowIn");
  assert.equal(rowIn, undefined, "Found @keyframes rowIn; must be lowercase rowin");
});

check("Keyframe Casing: Canonical 'rowin' keyframe is defined", () => {
  const rowin = allKeyframes.find(k => k.name === "rowin");
  assert.ok(rowin, "Expected @keyframes rowin to be defined");
});

check("Keyframe Casing: Check 'coverfloat' vs 'coverFloat' standardization", () => {
  const coverFloat = allKeyframes.find(k => k.name === "coverFloat");
  const coverfloat = allKeyframes.find(k => k.name === "coverfloat");
  // Check if both exist or if naming matches expectations
  if (coverFloat && !coverfloat) {
    throw new Error(
      "Keyframe is defined as camelCase 'coverFloat', but project standard / Tier 1 test F02-02 expects lowercase 'coverfloat'"
    );
  }
  assert.ok(coverfloat, "Expected canonical lowercase @keyframes coverfloat to exist");
});

// ─── 2. ANIMATION INVOCATIONS VS KEYFRAME DEFINITIONS ─────────────────────────
// Parse rules and animation declarations
const standardTimingKeywords = new Set([
  "infinite", "both", "forwards", "backwards", "none",
  "ease", "linear", "ease-in", "ease-out", "ease-in-out",
  "step-start", "step-end", "running", "paused", "normal", "reverse", "alternate", "alternate-reverse"
]);

function extractAnimationNamesFromDeclaration(declValue) {
  // Can be multiple comma-separated animations
  // e.g. floatOrb 8s ease-in-out infinite, pulseGlow 6s ease-in-out infinite
  // Be careful with commas inside var() or cubic-bezier()
  const animParts = [];
  let parenDepth = 0;
  let currentPart = "";
  for (let i = 0; i < declValue.length; i++) {
    const ch = declValue[i];
    if (ch === "(") parenDepth++;
    else if (ch === ")") parenDepth--;
    else if (ch === "," && parenDepth === 0) {
      animParts.push(currentPart.trim());
      currentPart = "";
      continue;
    }
    currentPart += ch;
  }
  if (currentPart.trim()) animParts.push(currentPart.trim());

  const foundNames = [];
  for (const part of animParts) {
    const tokens = part.split(/\s+/).map(t => t.trim()).filter(Boolean);
    for (const tok of tokens) {
      if (standardTimingKeywords.has(tok.toLowerCase())) continue;
      if (/^[\d.]+(s|ms)?$/i.test(tok)) continue; // duration / delay
      if (/^cubic-bezier/i.test(tok) || /^steps/i.test(tok)) continue;
      if (/^var\(/i.test(tok)) continue; // CSS variables
      if (/^\d+$/.test(tok)) continue; // iteration count
      if (/^[a-zA-Z0-9_-]+$/.test(tok)) {
        foundNames.push(tok);
        break; // Only first identifier in animation shorthand is animation-name
      }
    }
  }
  return foundNames;
}

const ruleRegex = /([^{}@]+)\{([^}]+)\}/g;
let ruleMatch;
const animationInvocations = [];

while ((ruleMatch = ruleRegex.exec(cleanCss)) !== null) {
  const selector = ruleMatch[1].trim();
  const body = ruleMatch[2].trim();

  // Find animation:
  const animRegex = /(?:^|[;\s])animation\s*:\s*([^;]+)/g;
  let am;
  while ((am = animRegex.exec(body)) !== null) {
    const val = am[1].trim();
    const names = extractAnimationNamesFromDeclaration(val);
    names.forEach(name => {
      animationInvocations.push({ selector, name, fullDecl: val, prop: "animation" });
    });
  }

  // Find animation-name:
  const animNameRegex = /(?:^|[;\s])animation-name\s*:\s*([^;]+)/g;
  let anm;
  while ((anm = animNameRegex.exec(body)) !== null) {
    const val = anm[1].trim();
    val.split(",").map(s => s.trim()).forEach(name => {
      if (name && name !== "none") {
        animationInvocations.push({ selector, name, fullDecl: val, prop: "animation-name" });
      }
    });
  }
}

check("Animation Invocations: All animation calls match an existing @keyframes definition", () => {
  const definedKeyframeNames = new Set(allKeyframes.map(k => k.name));
  const missing = [];
  for (const inv of animationInvocations) {
    if (inv.name === "none" || inv.name === "inherit" || inv.name === "initial") continue;
    if (!definedKeyframeNames.has(inv.name)) {
      missing.push(inv);
    }
  }
  assert.equal(
    missing.length,
    0,
    `Found animation invocations referencing undefined keyframes: ${JSON.stringify(missing)}`
  );
});

check("Animation Invocations: Exact casing match between invocation and @keyframes definition", () => {
  const definedKeyframeMap = new Map();
  allKeyframes.forEach(k => definedKeyframeMap.set(k.name.toLowerCase(), k.name));
  const caseMismatches = [];
  for (const inv of animationInvocations) {
    if (inv.name === "none" || inv.name === "inherit" || inv.name === "initial") continue;
    const definedExact = definedKeyframeMap.get(inv.name.toLowerCase());
    if (definedExact && definedExact !== inv.name) {
      caseMismatches.push({
        selector: inv.selector,
        invoked: inv.name,
        definedAs: definedExact
      });
    }
  }
  assert.equal(
    caseMismatches.length,
    0,
    `Found casing mismatches: ${JSON.stringify(caseMismatches)}`
  );
});

// ─── 3. REFLOW ANALYSIS IN @KEYFRAMES ─────────────────────────────────────────
const REFLOW_PROPERTIES = [
  "height", "min-height", "max-height",
  "width", "min-width", "max-width",
  "top", "bottom", "left", "right",
  "margin", "margin-top", "margin-bottom", "margin-left", "margin-right",
  "padding", "padding-top", "padding-bottom", "padding-left", "padding-right"
];

check("Reflow in @keyframes: Zero keyframe blocks animate geometry/reflow properties", () => {
  const violations = [];
  for (const kf of allKeyframes) {
    const propRegex = /([a-z-]+)\s*:/g;
    let pm;
    while ((pm = propRegex.exec(kf.body)) !== null) {
      const prop = pm[1].toLowerCase();
      if (REFLOW_PROPERTIES.includes(prop)) {
        violations.push({ keyframe: kf.name, property: prop, body: kf.body });
      }
    }
  }
  assert.equal(
    violations.length,
    0,
    `Found keyframes animating reflow properties: ${JSON.stringify(violations)}`
  );
});

// ─── 4. EQUALIZER BOUNCE SPECIFICATION (eqBounce) ─────────────────────────────
check("Equalizer eqBounce: Uses transform scaleY with bottom origin and fixed geometry", () => {
  const eqBounce = allKeyframes.find(k => k.name === "eqBounce");
  assert.ok(eqBounce, "@keyframes eqBounce must be defined");
  assert.doesNotMatch(eqBounce.body, /\bheight\s*:/, "eqBounce must not animate height");
  assert.match(eqBounce.body, /scaleY\(/, "eqBounce must animate scaleY");

  // Check .eq-bar styles
  const allEqBars = [];
  const eqBarRuleRegex = /([^{}@]+)\{([^}]+)\}/g;
  let eqm;
  while ((eqm = eqBarRuleRegex.exec(cleanCss)) !== null) {
    if (eqm[1].includes(".eq-bar")) {
      allEqBars.push({ selector: eqm[1].trim(), body: eqm[2].trim() });
    }
  }
  assert.ok(allEqBars.length > 0, ".eq-bar rules must exist");
  const baseRule = allEqBars.find(r => r.body.includes("animation: eqBounce") || r.body.includes("animation:eqBounce"));
  assert.ok(baseRule, "Expected base .eq-bar rule with animation eqBounce");
  assert.match(baseRule.body, /height\s*:\s*\d+px/, ".eq-bar must have fixed height");
  assert.match(baseRule.body, /transform-origin\s*:\s*bottom/, ".eq-bar must have transform-origin: bottom");
});

// ─── 5. TRANSITION REFLOW ELIMINATION (PROJECT.md F04) ───────────────────────
check("Reflow in Transitions: .seg::before does not transition layout properties (left/width)", () => {
  const segRegex = /\.seg::before\s*\{([^}]+)\}/g;
  let sm;
  const violations = [];
  while ((sm = segRegex.exec(cleanCss)) !== null) {
    const body = sm[1];
    const transMatch = body.match(/(?:^|[;\s])transition\s*:\s*([^;]+)/);
    if (transMatch) {
      const transVal = transMatch[1];
      if (/\b(left|width)\b/.test(transVal)) {
        violations.push({ body, transition: transVal });
      }
    }
  }
  assert.equal(
    violations.length,
    0,
    `.seg::before transitions geometric reflow property: ${JSON.stringify(violations)}`
  );
});

check("Reflow in Transitions: .prog3 i does not transition width", () => {
  const progRegex = /\.prog3\s+i\s*\{([^}]+)\}/g;
  let pm;
  const violations = [];
  while ((pm = progRegex.exec(cleanCss)) !== null) {
    const body = pm[1];
    const transMatch = body.match(/(?:^|[;\s])transition\s*:\s*([^;]+)/);
    if (transMatch) {
      const transVal = transMatch[1];
      if (/\bwidth\b/.test(transVal)) {
        violations.push({ body, transition: transVal });
      }
    }
  }
  assert.equal(
    violations.length,
    0,
    `.prog3 i transitions geometric reflow property width: ${JSON.stringify(violations)}`
  );
});

check("Reflow in Transitions: .sw:active does not transition or change width", () => {
  const swRegex = /\.sw:active(?:::after)?\s*\{([^}]+)\}/g;
  let swm;
  const violations = [];
  while ((swm = swRegex.exec(cleanCss)) !== null) {
    const body = swm[1];
    if (/\bwidth\s*:/.test(body)) {
      violations.push({ body });
    }
  }
  assert.equal(
    violations.length,
    0,
    `.sw:active changes width: ${JSON.stringify(violations)}`
  );
});

check("Reflow in Transitions: .fpseek .track:hover does not transition height", () => {
  const seekRegex = /\.fpseek\s+\.track:hover\s*\{([^}]+)\}/g;
  let skm;
  const violations = [];
  while ((skm = seekRegex.exec(cleanCss)) !== null) {
    const body = skm[1];
    if (/\bheight\s*:/.test(body)) {
      violations.push({ body });
    }
  }
  assert.equal(
    violations.length,
    0,
    `.fpseek .track:hover changes height: ${JSON.stringify(violations)}`
  );
});

// ─── 6. PREFERS-REDUCED-MOTION ADVERSARIAL CHECKS ─────────────────────────────
check("Prefers-Reduced-Motion: Universal CSS override exists and caps infinite loops", () => {
  assert.match(
    cleanCss,
    /@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)/,
    "Missing @media (prefers-reduced-motion: reduce) in CSS"
  );
  assert.match(
    cleanCss,
    /animation-duration\s*:\s*0\.001ms\s*!important/,
    "Missing animation-duration: 0.001ms !important override"
  );
  assert.match(
    cleanCss,
    /animation-iteration-count\s*:\s*1\s*!important/,
    "Missing animation-iteration-count: 1 !important override"
  );
});

check("Prefers-Reduced-Motion: JS event listener dynamically updates BOOT.reduce", () => {
  assert.match(rawJs, /matchMedia\s*\(\s*["']\(prefers-reduced-motion:\s*reduce\)["']\s*\)/);
  assert.match(rawJs, /motionMedia\.addEventListener\s*\(\s*["']change["']/);
});

check("Prefers-Reduced-Motion: Audio clock and karaoke sync continue advancing under reduced motion", () => {
  // Adversarial check: In frame() loop, does advanceClock and syncKaraokeFrame still run when isReduce is true?
  const frameFnMatch = rawJs.match(/function frame\s*\([^\)]*\)\s*\{([\s\S]*?)\n\s*raf\s*=\s*requestAnimationFrame\(frame\)/);
  assert.ok(frameFnMatch, "Could not locate frame(now) function in src/app.js");
  const frameBody = frameFnMatch[1];
  assert.match(frameBody, /advanceClock/, "advanceClock must be called in frame() regardless of reduced motion");
  assert.match(frameBody, /syncKaraokeFrame/, "syncKaraokeFrame must be called in frame() regardless of reduced motion");
});

console.log("\n=================================================================");
console.log(`ORACLE SCORECARD: Passed: ${results.passed}, Failed: ${results.failed}`);
console.log("=================================================================");

if (results.failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
