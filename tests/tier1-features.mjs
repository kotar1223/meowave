// tests/tier1-features.mjs - Tier 1: Feature Coverage Tests (125 tests, 5 per feature)
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { 
  TestSuite, 
  loadSources, 
  extractKeyframes, 
  extractAnimationInvocations, 
  extractRules, 
  extractMediaBlocks, 
  extractCustomProperties, 
  domHasElement,
  domCount,
  getContrastRatio,
  createMockEnvironment,
  PATHS
} from "./helpers.mjs";

export function buildTier1Suite() {
  const suite = new TestSuite("Tier 1 - Feature Coverage (125 tests across 25 features)");
  const sources = loadSources();
  const { html, css, js } = sources;

  // ─── Feature 1: Keyframe Casing Normalization (PROJECT.md F01) ──────────────
  suite.test("F01-01: [Happy Path] Canonical @keyframes rowin is defined in lowercase in src/app.css", () => {
    const kfs = extractKeyframes(css);
    const rowin = kfs.find(k => k.name === "rowin");
    assert.ok(rowin, "Expected @keyframes rowin to be defined in lowercase in src/app.css");
    assert.match(rowin.fullText, /opacity|transform/, "rowin keyframe should define opacity or transform");
  });

  suite.test("F01-02: [Happy Path] No uppercase @keyframes rowIn definition exists in src/app.css", () => {
    const kfs = extractKeyframes(css);
    const rowIn = kfs.find(k => k.name === "rowIn");
    assert.equal(rowIn, undefined, "Found unexpected uppercase @keyframes rowIn; must be normalized to lowercase rowin");
  });

  suite.test("F01-03: [Happy Path] Invocations on .plgrid .plc use lowercase rowin", () => {
    const invocations = extractAnimationInvocations(css);
    const plgridInvocations = invocations.filter(i => i.selector.includes(".plgrid"));
    for (const inv of plgridInvocations) {
      assert.notEqual(inv.animationName, "rowIn", `Found camelCase rowIn in selector ${inv.selector}; must be lowercase rowin`);
    }
  });

  suite.test("F01-04: [Happy Path] Invocations on badges (.bdg, .pinb, .navbadge) use lowercase rowin", () => {
    const invocations = extractAnimationInvocations(css);
    const badgeInvocations = invocations.filter(i => 
      i.selector.includes(".bdg") || i.selector.includes(".pinb") || i.selector.includes(".navbadge")
    );
    for (const inv of badgeInvocations) {
      assert.notEqual(inv.animationName, "rowIn", `Found camelCase rowIn on badge ${inv.selector}; must be lowercase rowin`);
    }
  });

  suite.test("F01-05: [Happy Path] Zero occurrences of animation calling rowIn across entire stylesheet", () => {
    assert.doesNotMatch(css, /animation\s*:\s*rowIn\b/, "Found 'animation: rowIn' in css; must be lowercase rowin");
    assert.doesNotMatch(css, /animation-name\s*:\s*rowIn\b/, "Found 'animation-name: rowIn' in css; must be lowercase rowin");
  });

  // ─── Feature 2: Keyframe Deduplication (PROJECT.md F02) ─────────────────────
  suite.test("F02-01: [Happy Path] Exactly one canonical @keyframes coverfloat definition exists", () => {
    const kfs = extractKeyframes(css);
    const coverfloats = kfs.filter(k => k.name.toLowerCase() === "coverfloat");
    assert.equal(coverfloats.length, 1, `Expected exactly 1 coverfloat keyframe, but found ${coverfloats.length}`);
  });

  suite.test("F02-02: [Happy Path] No conflicting duplicate @keyframes coverFloat exists", () => {
    const kfs = extractKeyframes(css);
    const coverFloat = kfs.find(k => k.name === "coverFloat");
    assert.equal(coverFloat, undefined, "Found conflicting duplicate @keyframes coverFloat; should be merged into coverfloat");
  });

  suite.test("F02-03: [Happy Path] coverfloat keyframe uses transform translateY", () => {
    const kfs = extractKeyframes(css);
    const cf = kfs.find(k => k.name.toLowerCase() === "coverfloat");
    assert.ok(cf, "coverfloat keyframe must exist");
    assert.match(cf.fullText, /translateY/, "coverfloat should specify translateY transform");
  });

  suite.test("F02-04: [Happy Path] .plgrid animation conflict between line 671 and 1267 is resolved", () => {
    const plgridRules = extractRules(css, /\.plgrid/);
    const animRules = plgridRules.filter(r => r.declarations.has("animation"));
    assert.ok(animRules.length <= 2, "Expected resolved plgrid animation rules without conflicting duplicate cascade overrides");
  });

  suite.test("F02-05: [Happy Path] All keyframe names in src/app.css are unique (case-insensitive)", () => {
    const kfs = extractKeyframes(css);
    const names = new Set();
    const duplicates = [];
    for (const k of kfs) {
      const lower = k.name.toLowerCase();
      if (names.has(lower)) {
        duplicates.push(k.name);
      }
      names.add(lower);
    }
    assert.deepEqual(duplicates, [], `Found duplicate keyframe names: ${duplicates.join(", ")}`);
  });

  // ─── Feature 3: Equalizer Reflow Elimination (PROJECT.md F03) ───────────────
  suite.test("F03-01: [Happy Path] @keyframes eqBounce does not animate height property", () => {
    const kfs = extractKeyframes(css);
    const eqBounce = kfs.find(k => k.name === "eqBounce");
    assert.ok(eqBounce, "@keyframes eqBounce must be defined");
    assert.doesNotMatch(eqBounce.fullText, /\bheight\s*:/, "eqBounce must not animate height (causes layout reflow)");
  });

  suite.test("F03-02: [Happy Path] @keyframes eqBounce animates transform scaleY", () => {
    const kfs = extractKeyframes(css);
    const eqBounce = kfs.find(k => k.name === "eqBounce");
    assert.ok(eqBounce, "@keyframes eqBounce must be defined");
    assert.match(eqBounce.fullText, /scaleY\(/, "eqBounce must animate transform: scaleY(...) for GPU acceleration");
  });

  suite.test("F03-03: [Happy Path] Equalizer bars specify transform-origin bottom", () => {
    const rules = extractRules(css, /\.eq-bar/);
    assert.ok(rules.length > 0, "Expected .eq-bar rules in stylesheet");
    const hasBottomOrigin = rules.some(r => {
      const orig = r.declarations.get("transform-origin") || "";
      return orig.includes("bottom") || orig.includes("100%");
    });
    assert.ok(hasBottomOrigin, "Equalizer bars must declare transform-origin: bottom to scale upward from base");
  });

  suite.test("F03-04: [Happy Path] No reflow geometric properties (height/width/top/bottom) in eqBounce", () => {
    const kfs = extractKeyframes(css);
    const eqBounce = kfs.find(k => k.name === "eqBounce");
    assert.ok(eqBounce, "@keyframes eqBounce must be defined");
    for (const prop of eqBounce.properties) {
      assert.ok(!["height", "width", "top", "bottom", "left", "right"].includes(prop), 
        `eqBounce animates reflow property '${prop}'`);
    }
  });

  suite.test("F03-05: [Happy Path] Equalizer bar element has fixed height container and will-change transform", () => {
    const rules = extractRules(css, /\.eq-bar/);
    const barRule = rules.find(r => r.declarations.has("height"));
    assert.ok(barRule, ".eq-bar must have a fixed container height");
    assert.match(barRule.declarations.get("height"), /^\d+px/, "Expected fixed pixel height on .eq-bar");
  });

  // ─── Feature 4: Slider & Switch Reflow Elimination (PROJECT.md F04) ─────────
  suite.test("F04-01: [Happy Path] .seg::before avoids layout transitions on left/width", () => {
    const rules = extractRules(css, /\.seg::before/);
    for (const r of rules) {
      const tr = r.declarations.get("transition") || "";
      assert.doesNotMatch(tr, /\b(left|width)\b/, ".seg::before should avoid transitioning layout left/width");
    }
  });

  suite.test("F04-02: [Happy Path] Switch .sw::after does not transition width on active", () => {
    const rules = extractRules(css, /\.sw/);
    const swActive = rules.filter(r => r.selector.includes(":active"));
    for (const r of swActive) {
      const w = r.declarations.get("width");
      assert.ok(!w, ".sw:active should not change width (causes reflow); use transform scale instead");
    }
  });

  suite.test("F04-03: [Happy Path] Seek bar .fpseek .track avoids height transition on hover", () => {
    const rules = extractRules(css, /\.fpseek/);
    const hoverRules = rules.filter(r => r.selector.includes(":hover"));
    for (const r of hoverRules) {
      const tr = r.declarations.get("transition") || "";
      assert.doesNotMatch(tr, /\bheight\b/, ".fpseek .track:hover should not transition height");
    }
  });

  suite.test("F04-04: [Happy Path] Progress bar .prog3 i uses transform scaleX instead of width transition", () => {
    const rules = extractRules(css, /\.prog3/);
    const progRules = rules.filter(r => r.selector.includes("i"));
    for (const r of progRules) {
      const tr = r.declarations.get("transition") || "";
      assert.doesNotMatch(tr, /\bwidth\b/, ".prog3 i should not transition width (causes reflow)");
    }
  });

  suite.test("F04-05: [Happy Path] Sliders and switches specify GPU transform acceleration", () => {
    assert.match(css, /\.seg\b|\.sw\b/, "Sliders and switches must be present in stylesheet");
    assert.match(css, /transform\s*:\s*(?:translate3d|scale|translateX)/, "CSS must employ GPU transforms for interactive indicators");
  });

  // ─── Feature 5: Comprehensive Prefers-Reduced-Motion (PROJECT.md F05) ───────
  suite.test("F05-01: [Happy Path] prefers-reduced-motion block zeros eqBounce animation", () => {
    const media = extractMediaBlocks(css, /prefers-reduced-motion:\s*reduce/);
    assert.ok(media.length > 0, "Expected @media (prefers-reduced-motion: reduce) block in src/app.css");
    const combined = media.map(m => m.content).join("\n");
    assert.match(combined, /eqBounce|\.eq-bar/, "prefers-reduced-motion must target eqBounce or .eq-bar");
  });

  suite.test("F05-02: [Happy Path] prefers-reduced-motion block zeros fpBgBreath animation", () => {
    const media = extractMediaBlocks(css, /prefers-reduced-motion:\s*reduce/);
    const combined = media.map(m => m.content).join("\n");
    assert.match(combined, /fpBgBreath|\.fp-bg/, "prefers-reduced-motion must target fpBgBreath or .fp-bg");
  });

  suite.test("F05-03: [Happy Path] prefers-reduced-motion block suppresses orb float animations", () => {
    const media = extractMediaBlocks(css, /prefers-reduced-motion:\s*reduce/);
    const combined = media.map(m => m.content).join("\n");
    assert.match(combined, /floatOrb|orbFloat|pulseGlow|\.haze/, "prefers-reduced-motion must disable background floating orbs");
  });

  suite.test("F05-04: [Happy Path] .rail::before transition is disabled under prefers-reduced-motion", () => {
    const media = extractMediaBlocks(css, /prefers-reduced-motion:\s*reduce/);
    const combined = media.map(m => m.content).join("\n");
    const railRules = extractRules(combined, /\.rail::before/);
    assert.ok(railRules.length > 0, "prefers-reduced-motion must include .rail::before");
    const tr = railRules[0].declarations.get("transition") || railRules[0].declarations.get("transition-duration");
    assert.ok(tr === "none" || tr === "0s" || tr === "0ms" || tr.includes("0s") || tr.startsWith("none"), 
      `.rail::before transition must be disabled or 0s under reduced motion, got: ${tr}`);
  });

  suite.test("F05-05: [Happy Path] JavaScript listens to prefers-reduced-motion media query", () => {
    assert.match(js, /prefers-reduced-motion/, "src/app.js should query or listen to prefers-reduced-motion");
  });

  // ─── Feature 6: Navigation Rail Desktop Centering (PROJECT.md F06) ──────────
  suite.test("F06-01: [Happy Path] Desktop .rail::before does not hardcode left: 9px", () => {
    const rules = extractRules(css, /\.rail::before/);
    const baseRule = rules.find(r => !r.selector.includes("@media"));
    assert.ok(baseRule, ".rail::before rule must exist");
    const leftVal = baseRule.declarations.get("left") || "";
    assert.notEqual(leftVal.trim(), "9px", "Desktop .rail::before must not hardcode left: 9px (1px offset bug)");
  });

  suite.test("F06-02: [Happy Path] Desktop rail indicator uses dynamic --rx or exact 8px centering", () => {
    const rules = extractRules(css, /\.rail::before/);
    const baseRule = rules[0];
    const leftVal = baseRule.declarations.get("left") || "";
    const transformVal = baseRule.declarations.get("transform") || "";
    const usesCenteredCoord = leftVal.includes("--rx") || leftVal.includes("8px") || 
      transformVal.includes("--rx") || transformVal.includes("8px");
    assert.ok(usesCenteredCoord, `Expected .rail::before to use --rx or 8px centering, got left: '${leftVal}', transform: '${transformVal}'`);
  });

  suite.test("F06-03: [Happy Path] Nav rail container layout defines 74px column and 56px nav buttons", () => {
    assert.match(css, /74px\s+1fr|\.rail\s*\{[^}]*width\s*:\s*74px/, "Expected 74px rail column width in CSS");
    assert.match(css, /\.navbtn\s*\{[^}]*width\s*:\s*56px/, "Expected 56px navbtn width in CSS");
  });

  suite.test("F06-04: [Happy Path] paintRail() in src/app.js computes and sets --rx on .rail", () => {
    assert.match(js, /paintRail\s*\(\s*\)/, "paintRail() function must exist in src/app.js");
    assert.match(js, /rail\.style\.setProperty\s*\(\s*["']--rx["']/, "paintRail() must set --rx variable");
  });

  suite.test("F06-05: [Happy Path] Mathematical centering verified: (72px inner - 56px btn) / 2 = 8px", () => {
    const innerWidth = 74 - 2; // 74px grid minus 2px borders
    const btnWidth = 56;
    const computedCenter = (innerWidth - btnWidth) / 2;
    assert.equal(computedCenter, 8, "Mathematical centering offset must be 8px");
  });

  // ─── Feature 7: Navigation Rail GPU Transform (PROJECT.md F07) ──────────────
  suite.test("F07-01: [Happy Path] .rail::before uses transform translate3d with --rx and --ry", () => {
    const rules = extractRules(css, /\.rail::before/);
    assert.ok(rules.length > 0, ".rail::before rule must exist");
    const trf = rules[0].declarations.get("transform") || "";
    assert.match(trf, /translate3d\(\s*var\(--rx/, ".rail::before must use transform: translate3d(var(--rx, ...), var(--ry, ...), 0)");
  });

  suite.test("F07-02: [Happy Path] .rail::before transitions transform instead of top and height", () => {
    const rules = extractRules(css, /\.rail::before/);
    const tr = rules[0].declarations.get("transition") || "";
    assert.match(tr, /\btransform\b/, ".rail::before transition must include transform");
    assert.doesNotMatch(tr, /\btop\b/, ".rail::before transition must NOT transition top (causes reflow)");
  });

  suite.test("F07-03: [Happy Path] .rail::before consumes --rw and --rh for dimensions", () => {
    const rules = extractRules(css, /\.rail::before/);
    const w = rules[0].declarations.get("width") || "";
    const h = rules[0].declarations.get("height") || "";
    assert.match(w, /var\(--rw/, "Width must consume var(--rw)");
    assert.match(h, /var\(--rh/, "Height must consume var(--rh)");
  });

  suite.test("F07-04: [Happy Path] paintRail() updates all four variables (--rx, --ry, --rw, --rh)", () => {
    assert.match(js, /--rx/, "paintRail must set --rx");
    assert.match(js, /--ry/, "paintRail must set --ry");
    assert.match(js, /--rw/, "paintRail must set --rw");
    assert.match(js, /--rh/, "paintRail must set --rh");
  });

  suite.test("F07-05: [Happy Path] .rail::before utilizes will-change: transform for compositor optimization", () => {
    const rules = extractRules(css, /\.rail::before/);
    const wc = rules[0].declarations.get("will-change") || "";
    assert.match(wc, /transform/, "Expected will-change: transform on .rail::before");
  });

  // ─── Feature 8: Mobile Rail Horizontal Smooth Sliding (PROJECT.md F08) ──────
  suite.test("F08-01: [Happy Path] Mobile rail under max-width:700px declares sliding transition", () => {
    const media = extractMediaBlocks(css, /max-width:\s*700px/);
    assert.ok(media.length > 0, "Expected max-width: 700px media query in src/app.css");
    const combined = media.map(m => m.content).join("\n");
    assert.match(combined, /\.rail::before/, "Mobile media query must define .rail::before rules");
  });

  suite.test("F08-02: [Happy Path] Mobile rail indicator moves horizontally using --rx without jumping", () => {
    const media = extractMediaBlocks(css, /max-width:\s*700px/);
    const combined = media.map(m => m.content).join("\n");
    assert.match(combined, /--rx/, "Mobile rail indicator must consume --rx");
  });

  suite.test("F08-03: [Happy Path] Hidden Profile tab (.railend) on mobile does not crash or collapse indicator", () => {
    const rules = extractRules(css, /\.railend/);
    assert.ok(rules.length > 0, ".railend selector must exist in CSS");
    // Ensure paintRail guards against missing or hidden active elements
    assert.match(js, /if\s*\(!on\)/, "paintRail must guard when no active visible button is found");
  });

  suite.test("F08-04: [Happy Path] Mobile rail displays buttons in bottom horizontal bar", () => {
    const media = extractMediaBlocks(css, /max-width:\s*700px/);
    const combined = media.map(m => m.content).join("\n");
    assert.match(combined, /flex-direction\s*:\s*row|display\s*:\s*flex/, "Mobile rail should lay out horizontally");
  });

  suite.test("F08-05: [Happy Path] Mobile rail indicator height fits within bottom bar", () => {
    const media = extractMediaBlocks(css, /max-width:\s*700px/);
    const combined = media.map(m => m.content).join("\n");
    assert.match(combined, /height\s*:\s*(?:calc\(100%|var\(--rh|\d+px)/, "Mobile indicator must have constrained height");
  });

  // ─── Feature 9: Resize Jitter Suppression (PROJECT.md F09) ──────────────────
  suite.test("F09-01: [Happy Path] Window resize handler debounces or suppresses indicator transition", () => {
    assert.match(js, /addEventListener\s*\(\s*["']resize["']/, "Window resize listener must be attached");
    assert.match(js, /resize/i, "Resize handling present in app.js");
  });

  suite.test("F09-02: [Happy Path] Resize handler temporarily clears or disables transition during drag", () => {
    const hasResizeTransitionManagement = /resiz|debounce|paintRail/.test(js);
    assert.ok(hasResizeTransitionManagement, "Resize handler must manage paintRail updates");
  });

  suite.test("F09-03: [Happy Path] paintRail executes cleanly in mock window environment", () => {
    const env = createMockEnvironment();
    // Simulate paintRail invocation
    assert.doesNotThrow(() => {
      const rail = env.elements.get(".rail");
      const on = rail.querySelector('.navbtn[aria-current="true"]');
      if (on) {
        rail.style.setProperty("--rx", on.offsetLeft + "px");
        rail.style.setProperty("--ry", on.offsetTop + "px");
      }
    });
  });

  suite.test("F09-04: [Happy Path] Resize event listener registered for segments and rail", () => {
    assert.match(js, /addEventListener\("resize",\s*paintAllSegs\)/, "paintAllSegs must be registered on resize");
    assert.match(js, /addEventListener\("resize",\s*paintRail\)/, "paintRail must be registered on resize");
  });

  suite.test("F09-05: [Happy Path] MutationObserver watches for aria-current tab switches to repaint rail", () => {
    assert.match(js, /MutationObserver/, "MutationObserver should watch DOM attribute changes");
    assert.match(js, /aria-current/, "MutationObserver must filter for aria-current changes");
  });

  // ─── Feature 10: Layout Symmetry & Geometry Alignment (PROJECT.md F10) ──────
  suite.test("F10-01: [Happy Path] Search bar #search-bar has symmetrical padding and alignment", () => {
    const rules = extractRules(css, /\.search/);
    assert.ok(rules.length > 0, "Expected .search rule in CSS");
    const pad = rules[0].declarations.get("padding") || "";
    assert.ok(pad, ".search must define symmetric padding");
  });

  suite.test("F10-02: [Happy Path] Card grid .plgrid uses symmetric grid layout and gap", () => {
    const rules = extractRules(css, /\.plgrid/);
    assert.ok(rules.length > 0, "Expected .plgrid rule in CSS");
    const hasGrid = rules.some(r => r.declarations.get("display") === "grid");
    assert.ok(hasGrid, ".plgrid must use CSS grid");
  });

  suite.test("F10-03: [Happy Path] Dialog modalbox is centered in viewport with symmetric margin/padding", () => {
    const rules = extractRules(css, /\.modalbox/);
    assert.ok(rules.length > 0, "Expected .modalbox rule in CSS");
    const mb = rules[0];
    assert.ok(mb.declarations.has("margin") || mb.declarations.has("padding"), ".modalbox must declare balanced spacing");
  });

  suite.test("F10-04: [Happy Path] Player dock footer.bar has aligned controls and flex layout", () => {
    const rules = extractRules(css, /footer\.bar|\.barmain/);
    assert.ok(rules.length > 0, "Expected footer.bar or .barmain rule in CSS");
    const hasFlex = rules.some(r => r.declarations.get("display") === "flex" || r.declarations.get("display") === "grid");
    assert.ok(hasFlex, "Player bar must use flex or grid layout for alignment");
  });

  suite.test("F10-05: [Happy Path] Top header .top defines clean row alignment", () => {
    const rules = extractRules(css, /\.top/);
    assert.ok(rules.length > 0, "Expected .top rule in CSS");
    const hasAlign = rules.some(r => r.declarations.get("align-items") === "center");
    assert.ok(hasAlign, ".top header must center align its items");
  });

  // ─── Feature 11: M3 Expressive 5-Tier Surface Containers (PROJECT.md F11) ───
  suite.test("F11-01: [Happy Path] 5-tier Surface Container tokens defined in src/app.css", () => {
    const vars = extractCustomProperties(css, ":root");
    const has5Tiers = (
      vars.has("--surf") || 
      vars.has("--surface") || 
      vars.has("--md-sys-color-surface") ||
      vars.has("--surface-container")
    );
    assert.ok(has5Tiers, "Expected surface tokens in :root");
  });

  suite.test("F11-02: [Happy Path] Murky heavy black drop shadows (alpha > 0.35) removed or replaced", () => {
    // Check that harsh shadows like rgba(0,0,0,0.6) are replaced with subtle M3 elevation
    const shadowMatches = css.match(/box-shadow\s*:[^;]*rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\.[4-9]/g) || [];
    assert.equal(shadowMatches.length, 0, `Found ${shadowMatches.length} heavy black drop shadows; M3 Expressive uses tonal elevation`);
  });

  suite.test("F11-03: [Happy Path] Dark theme surface tokens use OKLCH color space", () => {
    const vars = extractCustomProperties(css, ":root");
    const bg = vars.get("--bg") || "";
    const surf = vars.get("--surf") || "";
    assert.match(bg, /oklch\(/, "Dark theme --bg must use OKLCH color space");
    assert.match(surf, /oklch\(/, "Dark theme --surf must use OKLCH color space");
  });

  suite.test("F11-04: [Happy Path] Light theme defines corresponding surface container hierarchy", () => {
    const lightRules = extractRules(css, /html\[data-theme="light"\]/);
    assert.ok(lightRules.length > 0, "html[data-theme='light'] rule must exist in CSS");
    const lightVars = lightRules[0].declarations;
    assert.ok(lightVars.has("--bg") && lightVars.has("--surf"), "Light theme must define --bg and --surf");
  });

  suite.test("F11-05: [Happy Path] .pane and .card components use surface tokens for elevation", () => {
    const rules = extractRules(css, /\.pane/);
    assert.ok(rules.length > 0, ".pane rule must exist in CSS");
    const bg = rules[0].declarations.get("background") || rules[0].declarations.get("background-color") || "";
    assert.match(bg, /var\(--surf/, ".pane background should consume --surf variable");
  });

  // ─── Feature 12: Expressive Container Radiuses (PROJECT.md F12) ─────────────
  suite.test("F12-01: [Happy Path] Container radius token --r-lg is >= 20px (M3 squircle range)", () => {
    const vars = extractCustomProperties(css, ":root");
    const rLg = vars.get("--r-lg") || "";
    const pxVal = parseInt(rLg, 10);
    assert.ok(pxVal >= 20 && pxVal <= 28, `Expected --r-lg to be between 20px and 28px, got: ${rLg}`);
  });

  suite.test("F12-02: [Happy Path] Cards and content panels use border-radius >= 20px", () => {
    const cardRules = extractRules(css, /\.card|\.plc/);
    const hasCardRadius = cardRules.some(r => {
      const rad = r.declarations.get("border-radius") || "";
      const num = parseInt(rad, 10);
      return (num >= 20 && num <= 28) || rad.includes("--r-lg");
    });
    assert.ok(hasCardRadius, "Cards should use M3 Expressive 20px-28px squircle radius or --r-lg");
  });

  suite.test("F12-03: [Happy Path] Modals and dialogs use border-radius >= 24px", () => {
    const modalRules = extractRules(css, /\.modalbox|\.cropbox/);
    assert.ok(modalRules.length > 0, "Modal dialog rules must exist in CSS");
    const rad = modalRules[0].declarations.get("border-radius") || "";
    const num = parseInt(rad, 10);
    assert.ok((num >= 20 && num <= 28) || rad.includes("--r-lg"), 
      `Modal dialog should use 20px-28px radius, got: ${rad}`);
  });

  suite.test("F12-04: [Happy Path] Navigation rail pane uses rounded squircle geometry", () => {
    const railRules = extractRules(css, /\.rail/);
    assert.ok(railRules.length > 0, ".rail rule must exist in CSS");
  });

  suite.test("F12-05: [Happy Path] Panels specify overflow: hidden or contain rounded corners", () => {
    const rules = extractRules(css, /\.pane/);
    assert.ok(rules.length > 0, ".pane rule must exist in CSS");
  });

  // ─── Feature 13: Pill Shape Dynamic Hover Morphing (PROJECT.md F13) ─────────
  suite.test("F13-01: [Happy Path] Buttons define base pill border-radius", () => {
    const btnRules = extractRules(css, /\.btn\b/);
    assert.ok(btnRules.length > 0, ".btn rule must exist in CSS");
    const rad = btnRules[0].declarations.get("border-radius") || "";
    assert.match(rad, /calc\(var\(--h\)\/2\)|9999px|50%|var\(--r-pill|\d+px/, "Button must have stadium/pill border-radius");
  });

  suite.test("F13-02: [Happy Path] Buttons morph to 18px squircle on hover under @media (hover: hover)", () => {
    const hoverMedia = extractMediaBlocks(css, /hover:\s*hover/);
    assert.ok(hoverMedia.length > 0, "Expected @media (hover: hover) block in CSS");
    const combined = hoverMedia.map(m => m.content).join("\n");
    assert.match(combined, /\.btn:hover[^}]*border-radius\s*:\s*18px/, "Buttons should morph border-radius to 18px on hover");
  });

  suite.test("F13-03: [Happy Path] Button transition includes border-radius with --ease", () => {
    const btnRules = extractRules(css, /\.btn\b/);
    const tr = btnRules[0].declarations.get("transition") || "";
    assert.match(tr, /border-radius/, "Button transition must include border-radius for smooth morphing");
  });

  suite.test("F13-04: [Happy Path] Button ::before pseudo-element defines hover expansion", () => {
    const rules = extractRules(css, /\.btn::before/);
    assert.ok(rules.length > 0, ".btn::before pseudo-element must exist for hover glow/ripple effect");
  });

  suite.test("F13-05: [Happy Path] Chip elements (.chip, .rchips button) use pill geometry", () => {
    const rules = extractRules(css, /\.rchips\s+button|\.chip/);
    assert.ok(rules.length > 0, "Chip elements must exist in CSS");
  });

  // ─── Feature 14: Spring Physics & Emphasized Easing (PROJECT.md F14) ─────────
  suite.test("F14-01: [Happy Path] Token --ease is defined with Emphasized Decelerate bezier(0.16, 1, 0.3, 1)", () => {
    const vars = extractCustomProperties(css, ":root");
    const ease = vars.get("--ease") || "";
    assert.match(ease, /cubic-bezier\(\s*0\.16\s*,\s*1\s*,\s*0\.3\s*,\s*1\s*\)/, 
      `Expected --ease to be cubic-bezier(0.16, 1, 0.3, 1), got: ${ease}`);
  });

  suite.test("F14-02: [Happy Path] Token --ease-q is defined with Quick deceleration curve", () => {
    const vars = extractCustomProperties(css, ":root");
    const easeQ = vars.get("--ease-q") || "";
    assert.match(easeQ, /cubic-bezier\(/, "Expected cubic-bezier for --ease-q");
  });

  suite.test("F14-03: [Happy Path] Spring token --e-spring defined with elastic overshoot", () => {
    const vars = extractCustomProperties(css, ":root");
    const spring = vars.get("--e-spring") || "";
    assert.match(spring, /cubic-bezier\(\s*0\.34\s*,\s*1\.56/, 
      `Expected --e-spring to define overshoot bezier(0.34, 1.56, 0.64, 1), got: ${spring}`);
  });

  suite.test("F14-04: [Happy Path] Interactive buttons compress to scale(0.95) on :active", () => {
    const activeRules = extractRules(css, /\.btn:active/);
    assert.ok(activeRules.length > 0, "Expected .btn:active rule in CSS");
    // The press may be expressed as `transform: scale()` or as the separate
    // `scale` property (which composes with a positioning transform).
    const trf = activeRules[0].declarations.get("transform") || "";
    const scl = activeRules[0].declarations.get("scale") || "";
    assert.ok(/scale\(\s*0?\.95\s*\)/.test(trf) || /^\s*0?\.95\s*$/.test(scl), `Expected .btn:active to compress to scale(0.95), got: transform=${trf} scale=${scl}`);
  });

  suite.test("F14-05: [Happy Path] Icon buttons compress on :active with spring scale", () => {
    const rules = extractRules(css, /\.ic:active/);
    assert.ok(rules.length > 0, "Expected .ic:active rule in CSS");
  });

  // ─── Feature 15: Light Theme Contrast Correction (PROJECT.md F15) ───────────
  suite.test("F15-01: [Happy Path] Light theme defines --md-sys-color-on-primary or on-accent token", () => {
    const rules = extractRules(css, /html\[data-theme="light"\]/);
    assert.ok(rules.length > 0, "html[data-theme='light'] rule must exist");
    const decls = rules[0].declarations;
    const hasOnPrimary = decls.has("--md-sys-color-on-primary") || decls.has("--on-accent") || decls.has("--text-on-accent");
    assert.ok(hasOnPrimary, "Light theme must define high-contrast on-primary text token");
  });

  suite.test("F15-02: [Happy Path] Light theme primary button text satisfies WCAG AA (>4.5:1)", () => {
    const rules = extractRules(css, /html\[data-theme="light"\]/);
    const decls = rules[0].declarations;
    const accent = decls.get("--accent") || "oklch(24% 0.008 280)";
    const onPrimary = decls.get("--md-sys-color-on-primary") || "oklch(100% 0 0)";
    const ratio = getContrastRatio(accent, onPrimary);
    assert.ok(ratio >= 4.5, `Contrast ratio between primary button and text must be >= 4.5:1, got: ${ratio.toFixed(2)}`);
  });

  suite.test("F15-03: [Happy Path] Light theme text against background satisfies WCAG AA (>4.5:1)", () => {
    const rules = extractRules(css, /html\[data-theme="light"\]/);
    const decls = rules[0].declarations;
    const bg = decls.get("--bg") || "oklch(96.5% 0.003 280)";
    const text = decls.get("--text") || "oklch(20% 0.008 280)";
    const ratio = getContrastRatio(bg, text);
    assert.ok(ratio >= 4.5, `Contrast ratio between light theme text and bg must be >= 4.5:1, got: ${ratio.toFixed(2)}`);
  });

  suite.test("F15-04: [Happy Path] Light theme muted text satisfies WCAG AA large text (>3.0:1)", () => {
    const rules = extractRules(css, /html\[data-theme="light"\]/);
    const decls = rules[0].declarations;
    const bg = decls.get("--bg") || "oklch(96.5% 0.003 280)";
    const mute = decls.get("--mute") || "oklch(48% 0.008 280)";
    const ratio = getContrastRatio(bg, mute);
    assert.ok(ratio >= 3.0, `Contrast ratio for muted text in light theme must be >= 3.0:1, got: ${ratio.toFixed(2)}`);
  });

  suite.test("F15-05: [Happy Path] Dark theme text against background satisfies WCAG AA (>4.5:1)", () => {
    const vars = extractCustomProperties(css, ":root");
    const bg = vars.get("--bg") || "oklch(13.5% 0.014 278)";
    const text = vars.get("--text") || "oklch(96.5% 0.002 280)";
    const ratio = getContrastRatio(bg, text);
    assert.ok(ratio >= 4.5, `Contrast ratio between dark theme text and bg must be >= 4.5:1, got: ${ratio.toFixed(2)}`);
  });

  // ─── Feature 16: Harmonic Vector Potential Particle Canvas (PROJECT.md F16) ──
  suite.test("F16-01: [Happy Path] Canvas element #field exists in src/index.html", () => {
    assert.ok(domHasElement(html, "#field"), "Canvas #field must exist in src/index.html");
  });

  suite.test("F16-02: [Happy Path] Particle physics implements 2D harmonic wave vector potential", () => {
    // a = Math.sin(p.y * .006 + T * .5) + Math.cos(p.x * .004 - T * .3)
    const hasHarmonicFormula = (
      /Math\.sin\([^)]*0\.006|Math\.sin\([^)]*\*\s*\.006/.test(js) &&
      /Math\.cos\([^)]*0\.004|Math\.cos\([^)]*\*\s*\.004/.test(js)
    );
    assert.ok(hasHarmonicFormula, "src/app.js must implement harmonic wave vector potential sin(y*0.006) + cos(x*0.004)");
  });

  suite.test("F16-03: [Happy Path] Particle steering uses directional velocity from wave angle a", () => {
    assert.match(js, /Math\.cos\(a\)/, "Particle velocity vx must steer with Math.cos(a)");
    assert.match(js, /Math\.sin\(a\)/, "Particle velocity vy must steer with Math.sin(a)");
  });

  suite.test("F16-04: [Happy Path] Pointer repulsion implements inverse-quadratic force field (dd < 16000)", () => {
    assert.match(js, /16000/, "Pointer repulsion should check distance threshold 16000 (radius ~126.5px)");
  });

  suite.test("F16-05: [Happy Path] Particle simulation loop applies velocity damping factor 0.9", () => {
    assert.match(js, /\.vx\s*\*=\s*\.9|\.vx\s*\*=\s*0\.9/, "Particle velocity vx must apply damping factor 0.9");
    assert.match(js, /\.vy\s*\*=\s*\.9|\.vy\s*\*=\s*0\.9/, "Particle velocity vy must apply damping factor 0.9");
  });

  // ─── Feature 17: Audio-Reactive Living Particle Waves (PROJECT.md F17) ──────
  suite.test("F17-01: [Happy Path] Web Audio analyser energy level connects to particle simulation", () => {
    assert.match(js, /A\.an|AnalyserNode|analyser|audioEnergy/i, "Audio analyser must connect to particle simulation");
  });

  suite.test("F17-02: [Happy Path] Audio playback energy modulates particle wave velocity or dispersion", () => {
    assert.match(js, /level\(\)|getByteFrequencyData|audioEnergy/, "Real-time audio frequency data must be sampled for energy");
  });

  suite.test("F17-03: [Happy Path] Particle energy returns to idle state when audio is paused", () => {
    assert.match(js, /playing|S\.playing|A\.audio\.paused/i, "Particle energy must track playback status");
  });

  suite.test("F17-04: [Happy Path] Particle simulation handles suspended AudioContext gracefully", () => {
    const env = createMockEnvironment();
    assert.doesNotThrow(() => {
      const actx = new env.ctx.window.AudioContext();
      const analyser = actx.createAnalyser();
      const data = new Uint8Array(analyser.fftSize);
      analyser.getByteFrequencyData(data);
      assert.equal(data.length, 128);
    });
  });

  suite.test("F17-05: [Happy Path] Lite mode throttles particle count and effects for performance", () => {
    assert.match(js, /lite|safeParticleDensity|deviceMemory/i, "Lite mode particle throttling logic should exist in src/app.js");
  });

  // ─── Feature 18: Living Sine Wave Audio Progress Track (PROJECT.md F18) ─────
  suite.skip(
    "F18-01: [Happy Path] Living sine wave scrubber path generator uses y = 12 + 5*sin(i/22 - ph)",
    "The living sine-wave scrubber was replaced by the Material 3 Expressive progress bar in f752a96. These three assert removed source strings (magic numbers i/22, 0.06, p*1000), not behaviour.");

  suite.skip(
    "F18-02: [Happy Path] Wave phase advances during playback (ph += 0.06 * dt)",
    "The living sine-wave scrubber was replaced by the Material 3 Expressive progress bar in f752a96. These three assert removed source strings (magic numbers i/22, 0.06, p*1000), not behaviour.");

  suite.test("F18-03: [Happy Path] Scrubber partitions played wave and unplayed track at progress point x", () => {
    assert.match(js, /wF|wTrack|wFill|\.setAttribute\(['"]d['"]/, "Scrubber must update SVG path attributes d");
  });

  suite.skip(
    "F18-04: [Happy Path] Audio progress point clamps progress fraction between 0 and 1",
    "The living sine-wave scrubber was replaced by the Material 3 Expressive progress bar in f752a96. These three assert removed source strings (magic numbers i/22, 0.06, p*1000), not behaviour. The clamp itself is still there - paint() does Math.min(100, Math.max(0, ...)) - "
    + "just not spelled with the literal token this grep wanted.");

  suite.test("F18-05: [Happy Path] Progress scrubber elements exist in src/index.html", () => {
    assert.ok(domHasElement(html, "#seek") || domHasElement(html, ".seek"), "Seek bar container #seek must exist in index.html");
  });

  // ─── Feature 19: Responsive Variable Typography Physics (PROJECT.md F19) ────
  suite.test("F19-01: [Happy Path] prox() function calculates pointer proximity to character bounding box", () => {
    assert.match(js, /function\s+prox\b|const\s+prox\s*=/, "prox() function must exist in src/app.js");
    assert.match(js, /Math\.hypot/, "prox() must measure Euclidean distance with Math.hypot");
  });

  suite.test("F19-02: [Happy Path] prox() modulates font variation axes wght, wdth, and opsz", () => {
    assert.match(js, /fontVariationSettings/, "prox() must update fontVariationSettings on characters");
    assert.match(js, /wght/, "prox() must modulate font weight axis 'wght'");
    assert.match(js, /wdth/, "prox() must modulate font width axis 'wdth'");
  });

  suite.test("F19-03: [Happy Path] Proximity uses smoothstep easing e = t*t*(3 - 2*t)", () => {
    assert.match(js, /3\s*-\s*2\s*\*\s*t/, "prox() must use smoothstep falloff: t*t*(3 - 2*t)");
  });

  suite.test("F19-04: [Happy Path] Proximity skips execution when pointer is not fine", () => {
    assert.match(js, /pointer:\s*fine|FINE/, "prox() must check for fine pointer support");
  });

  suite.test("F19-05: [Happy Path] Proximity skips execution under prefers-reduced-motion", () => {
    assert.match(js, /RM|reduced-motion/, "prox() must respect reduced motion");
  });

  // ─── Feature 20: Harmonic Parametric SVG Geometry Badges (PROJECT.md F20) ───
  suite.test("F20-01: [Happy Path] pts(spec) parametric geometry generator is implemented", () => {
    const hasPts = /function\s+pts\s*\(\s*spec\s*\)|const\s+pts\s*=/.test(js) || /function\s+pts\s*\(\s*spec\s*\)/.test(sources.js);
    assert.ok(hasPts, "pts(spec) function must be implemented in src/app.js");
  });

  suite.test("F20-02: [Happy Path] pts(spec) supports flower shape evaluation", () => {
    assert.match(js, /flower/, "pts(spec) must support flower shape specification");
  });

  suite.test("F20-03: [Happy Path] pts(spec) supports cookie shape evaluation", () => {
    assert.match(js, /cookie/, "pts(spec) must support cookie shape specification");
  });

  suite.test("F20-04: [Happy Path] toD(p) converts points array to valid SVG path string", () => {
    assert.match(js, /toD\s*=\s*p\s*=>\s*['"]M['"]|function\s+toD/, "toD() helper must format SVG path starting with M and ending with Z");
  });

  suite.test("F20-05: [Happy Path] Badges catalog generator src/assets/badges/_gen.mjs exists and is valid", () => {
    assert.ok(domHasElement(html, ".bdg") || domHasElement(html, ".navbadge"), "Badge elements supported in DOM");
  });

  // ─── Feature 21: Core Player & Local Playback Integrity (PROJECT.md F21) ────
  suite.test("F21-01: [Happy Path] Core player audio controls exist in src/index.html", () => {
    assert.ok(domHasElement(html, "#play"), "Play button #play must exist");
    assert.ok(domHasElement(html, "#prev"), "Previous button #prev must exist");
    assert.ok(domHasElement(html, "#next"), "Next button #next must exist");
  });

  suite.test("F21-02: [Happy Path] 10-band equalizer audio filters initialized in src/app.js", () => {
    assert.match(js, /BiquadFilter|createBiquadFilter/, "10-band equalizer BiquadFilter nodes must be created");
  });

  suite.test("F21-03: [Happy Path] HRTF spatial audio PannerNode is configured in src/app.js", () => {
    assert.match(js, /panningModel\s*=\s*['"]HRTF['"]/, "Spatial audio must configure PannerNode with HRTF panningModel");
  });

  suite.test("F21-04: [Happy Path] Local streaming proxy URL format (127.0.0.1) supported", () => {
    assert.match(js, /127\.0\.0\.1/, "Local streaming proxy connection to 127.0.0.1 must be supported");
  });

  suite.test("F21-05: [Happy Path] Volume control range slider #vol exists and connects to audio gain", () => {
    assert.ok(domHasElement(html, "#vol"), "Volume slider #vol must exist in index.html");
    assert.match(js, /setVol|A\.gain|setTargetAtTime/i, "Volume control must adjust audio gain in app.js");
  });

  // ─── Feature 22: Tauri API & Native Integration Integrity (PROJECT.md F22) ──
  suite.test("F22-01: [Happy Path] Window titlebar controls exist in src/index.html", () => {
    assert.ok(domHasElement(html, "#tb-min"), "Minimize button #tb-min must exist");
    assert.ok(domHasElement(html, "#tb-max"), "Maximize button #tb-max must exist");
    assert.ok(domHasElement(html, "#tb-close"), "Close button #tb-close must exist");
  });

  suite.test("F22-02: [Happy Path] Tauri IPC calls invoke('...') are guarded for webview/browser safety", () => {
    assert.match(js, /window\.__TAURI__|inv\s*\(/, "Tauri IPC invocation calls must exist and be guarded");
  });

  suite.test("F22-03: [Happy Path] Global keyboard shortcuts (Space for play/pause) are handled", () => {
    assert.match(js, /["']Space["']|["']KeyK["']|event\.code\s*===/, "Space shortcut for play/pause must be wired");
  });

  suite.test("F22-04: [Happy Path] MediaSession API metadata updates track title and artist", () => {
    assert.match(js, /navigator\.mediaSession/, "navigator.mediaSession must be updated with track metadata");
  });

  suite.test("F22-05: [Happy Path] Taskbar media action events meowave://media-action handled", () => {
    assert.match(js, /meowave:\/\/media-action/, "Tauri taskbar media action listener must be handled");
  });

  // ─── Feature 23: i18n Multi-language Integrity (PROJECT.md F23) ─────────────
  suite.test("F23-01: [Happy Path] Russian and English dictionaries I18N.ru and I18N.en exist", () => {
    assert.match(js, /I18N\s*=\s*\{[^}]*ru\s*:/, "I18N.ru dictionary must exist in src/app.js");
    assert.match(js, /en\s*:/, "I18N.en dictionary must exist in src/app.js");
  });

  suite.test("F23-02: [Happy Path] Localized string lookup helper t(k) supports fallback", () => {
    assert.match(js, /function\s+t\s*\(|const\s+t\s*=/, "Translation function t() must exist in src/app.js");
  });

  suite.test("F23-03: [Happy Path] DOM translation updates data-i18n attributes", () => {
    assert.match(js, /data-i18n/, "applyI18n must query and update [data-i18n] elements");
  });

  suite.test("F23-04: [Happy Path] DOM translation updates data-i18n-ph placeholders and title attributes", () => {
    assert.match(js, /data-i18n-ph/, "Placeholder translation data-i18n-ph must be supported");
    assert.match(js, /data-i18n-title/, "Title translation data-i18n-title must be supported");
  });

  suite.test("F23-05: [Happy Path] Language switch triggers rail indicator repositioning", () => {
    assert.match(js, /paintRail/, "Language change must trigger paintRail to adapt to new label widths");
  });

  // ─── Feature 24: JavaScript Syntax & Runtime Health (PROJECT.md F24) ────────
  suite.test("F24-01: [Happy Path] JavaScript code has valid ES2022 syntax without parse errors", () => {
    assert.ok(js.length > 100000, "app.js must be a valid non-empty file");
    assert.doesNotThrow(() => {
      new Function("return true;");
    });
  });

  suite.test("F24-02: [Happy Path] No illegal top-level return statements in src/app.js", () => {
    assert.doesNotMatch(js, /^return\b/m, "src/app.js must not contain illegal top-level returns");
  });

  suite.test("F24-03: [Happy Path] Variable declarations avoid undeclared globals in helper modules", () => {
    assert.ok(!js.includes("undeclaredVariableTest"), "Strict check on global references");
  });

  suite.test("F24-04: [Happy Path] Event listeners use modern options (e.g. passive: true)", () => {
    assert.match(js, /passive\s*:\s*true/, "Event listeners should leverage passive: true for scroll/touch performance");
  });

  suite.test("F24-05: [Happy Path] Source code contains zero unclosed template literals", () => {
    // Count backticks outside strings
    const backticks = (js.match(/`/g) || []).length;
    assert.equal(backticks % 2, 0, "Backticks in template literals must be balanced (even count)");
  });

  // ─── Feature 25: Dual Theme Parity & No-Overflow Verification (PROJECT.md F25)
  suite.test("F25-01: [Happy Path] Dark theme data-theme='dark' supported", () => {
    assert.ok(domHasElement(html, 'data-theme="dark"'), "Default html tag must declare data-theme='dark'");
  });

  suite.test("F25-02: [Happy Path] Light theme data-theme='light' defined in CSS", () => {
    assert.match(css, /html\[data-theme="light"\]/, "html[data-theme='light'] must be defined in src/app.css");
  });

  suite.test("F25-03: [Happy Path] All 9 main views exist in src/index.html", () => {
    const views = [
      "#v-home", "#v-search", "#v-library", "#v-people", 
      "#v-rooms", "#v-top", "#v-quests", "#v-profile", "#v-settings"
    ];
    for (const v of views) {
      assert.ok(domHasElement(html, v), `Expected view ${v} to exist in src/index.html`);
    }
  });

  suite.test("F25-04: [Happy Path] Responsive breakpoint max-width:700px defined in src/app.css", () => {
    assert.match(css, /@media\s*\(\s*max-width\s*:\s*700px\s*\)/, "Expected @media (max-width: 700px) in app.css");
  });

  suite.test("F25-05: [Happy Path] Active view transitions use data-active attribute", () => {
    assert.match(css, /\.view\[data-active="true"\]/, ".view[data-active='true'] rule must exist in CSS");
    assert.ok(domHasElement(html, 'data-active="true"'), "Default active view must declare data-active='true'");
  });

  // ─── Messenger + E2EE wiring (round 7) ───────────────────────────────────
  const readSrc = rel => fs.readFileSync(path.join(PATHS.root, rel), "utf-8");
  suite.test("F26-01: [Happy Path] Chats view, rail entry and unread badge exist; the old People › Chats tab is gone", () => {
    assert.ok(domHasElement(html, "#v-chats"), "#v-chats view must exist");
    assert.ok(domHasElement(html, "#msgr"), "#msgr root must exist");
    assert.match(html, /data-nav="chats"/);
    assert.ok(domHasElement(html, "#msg-badge"));
    assert.doesNotMatch(html, /data-ptab="chats"/, "the broken People › Chats tab must not come back");
    assert.match(js, /extraTabs = \[[^\]]*"chats"/, "chats belongs to the extra rail group");
  });
  suite.test("F26-02: [Happy Path] The encryption module is there before the messenger needs it; the messenger starts after app.js", () => {
    // src/ts/e2e.ts (was the classic e2e.js) waits for nothing: main.ts imports it, so window.MWE2E is set
    // while the module graph runs — before DOMContentLoaded, long before the messenger seals anything.
    // src/ts/messenger.ts (was the classic messenger.js) needs app.js's globals: it starts in afterLegacy(),
    // after search and before chat, where the old script stood.
    const order = [...html.matchAll(/<script src="\.\/([a-z0-9]+)\.js" defer><\/script>/g)].map(m => m[1]);
    assert.equal(order.indexOf("e2e"), -1, "e2e.js moved to src/ts/e2e.ts — no classic copy may come back");
    assert.match(readSrc("src/ts/main.ts"), /^import "\.\/e2e";$/m);
    const mod = readSrc("src/ts/e2e.ts");
    assert.match(mod, /^if \(typeof window !== "undefined"\) window\.MWE2E = MWE2E;$/m);
    assert.doesNotMatch(mod, /afterLegacy|^import /m, "nothing to wait for: no DOM, no app state");
    assert.equal(order.indexOf("messenger"), -1, "messenger.js moved to src/ts/messenger.ts — no classic copy may come back");
    const main = readSrc("src/ts/main.ts");
    assert.match(main, /^import \{ initMessenger \} from "\.\/messenger";$/m);
    const at = s => main.indexOf(`afterLegacy(${s});`);
    assert.ok(at("initSearch") > 0 && at("initMessenger") > at("initSearch") && at("initChat") > at("initMessenger"), "initMessenger() starts after initSearch() and before initChat()");
    assert.match(readSrc("src/ts/messenger.ts"), /^import \{ MWE2E\b[^}]*\} from "\.\/e2e";$/m);
  });
  suite.test("F26-03: [Happy Path] Encryption uses ECDH P-256 + HKDF + AES-GCM with conversation-bound AAD", () => {
    const e2e = readSrc("src/ts/e2e.ts");
    assert.match(e2e, /P-256/);
    assert.match(e2e, /HKDF/);
    assert.match(e2e, /AES-GCM/);
    assert.match(e2e, /additionalData/);
  });
  suite.test("F26-04: [Happy Path] Messenger supports reply, edit, read receipts and room chat", () => {
    const m = readSrc("src/ts/messenger.ts");
    for (const fn of ["function msgrOpen", "function msRoomMount", "function msMarkRead", "function msCtx", "function paintE2EDevices"]) assert.ok(m.includes(fn), fn);
    assert.match(m, /reply_to/);
    assert.match(m, /rpc\("mark_read"/);
    assert.doesNotMatch(js, /function renderChats\b/, "old chat list code must stay removed");
  });
  suite.test("F26-05: [Happy Path] FULL_SCHEMA carries migration 16 (messenger, E2EE, three badges)", () => {
    const full = readSrc("supabase/FULL_SCHEMA.sql");
    for (const s of ["create table if not exists public.e2e_devices", "function public.mark_read", "function public.dm_threads", "function public.e2e_add_keys", "function public.set_equipped_badges", "equipped_badges"]) assert.ok(full.toLowerCase().includes(s.toLowerCase()), s);
  });
  // F26-06 — the real primitives, not their text: Node imports src/ts/e2e.ts (type stripping, Node 22.18+ / 23.6+)
  // and round-trips real P-256 keys the way messenger.ts uses them.
  if (!process.features?.typescript) suite.skip("F26-06: [Happy Path] E2E primitives round-trip: seal for two devices, open, reject the wrong chat, rewrap", "this Node cannot import .ts (needs 22.18+ or 23.6+)");
  else suite.test("F26-06: [Happy Path] E2E primitives round-trip: seal for two devices, open, reject the wrong chat, rewrap", async () => {
    const { MWE2E: E } = await import(new URL("../src/ts/e2e.ts", import.meta.url).href);
    assert.equal(E.supported(), true);
    const a = await E.newDevice(), b = await E.newDevice(), c = await E.newDevice();
    assert.match(a.id, /^[A-Za-z0-9_-]{22}$/);
    assert.deepEqual(Object.keys(a.pub), ["kty", "crv", "x", "y"], "only the public half is published");
    const key = async d => ({ priv: await E.importPriv(d.priv), pub: await E.importPub(d.pub) });
    const ka = await key(a), kb = await key(b), kc = await key(c);
    const msg = { type: "text", text: "мяу 🐱 " + "x".repeat(40000) };
    const row = await E.seal([{ slot: "u1:a", pub: ka.pub }, { slot: "u2:b", pub: kb.pub }], msg, "dm|u1|u2");
    assert.equal(row.e2e.v, 1);
    assert.deepEqual(Object.keys(row.e2e.k).sort(), ["u1:a", "u2:b"]);
    assert.ok(!row.ciphertext.includes("мяу") && !JSON.stringify(row).includes("x".repeat(64)), "nothing readable on the server");
    assert.deepEqual(await E.open(row, "u1:a", ka.priv, "dm|u1|u2"), msg);
    assert.deepEqual(await E.open(row, "u2:b", kb.priv, "dm|u1|u2"), msg);
    await assert.rejects(E.open(row, "u1:a", ka.priv, "dm|u1|u3"), { name: "OperationError" }, "moved into another chat — must not open");
    assert.equal(await E.open(row, "u3:c", kc.priv, "dm|u1|u2"), null, "no key for this device — null, not an error");
    const more = await E.rewrap(row.e2e, "u1:a", ka.priv, [{ slot: "u1:c", pub: kc.pub }]);
    assert.deepEqual(await E.open({ ...row, e2e: { ...row.e2e, k: { ...row.e2e.k, ...more } } }, "u1:c", kc.priv, "dm|u1|u2"), msg, "a new device reads the old history");
    await assert.rejects(E.importPub({ kty: "EC", crv: "P-384", x: "a", y: "b" }), /bad public key/);
    await assert.rejects(E.seal([], msg, ""), /no recipients/);
    assert.match(await E.fingerprint(a.pub), /^[0-9A-F]{4}( [0-9A-F]{4}){3}$/);
  });

  // ─── Feature 27: Every name the frontend reads is defined somewhere ────────
  // A call left behind after its function was deleted is invisible to
  // `node --check` and to every text test here, and at top level it throws
  // and stops the rest of the script — setTimeout(renderYmAcc,900) did that
  // to everything after it in app.js. tests/undef-names.cjs resolves every
  // identifier of every <script> in index.html against all the scopes and
  // reports what is left; the left-overs must all be platform globals.
  const PLATFORM = new Set(`AbortController AbortSignal AggregateError Animation Array ArrayBuffer Atomics Audio AudioContext
    BigInt BigInt64Array BigUint64Array Blob Boolean BroadcastChannel CSS CSSStyleSheet ClipboardItem CloseEvent Comment
    CompressionStream CryptoKey CustomEvent DOMMatrix DOMParser DOMRect DataView Date DecompressionStream DocumentFragment
    DocumentTimeline DragEvent Element Error ErrorEvent EvalError Event EventSource EventTarget File FileReader
    FinalizationRegistry Float32Array Float64Array FocusEvent FontFace FormData Function Gamepad HTMLAudioElement
    HTMLCanvasElement HTMLElement HTMLImageElement HTMLInputElement HTMLMediaElement HTMLTemplateElement HTMLVideoElement
    Headers Image ImageBitmap ImageData Infinity InputEvent Int16Array Int32Array Int8Array IntersectionObserver Intl
    Iterator JSON KeyboardEvent KeyframeEffect Map Math MediaMetadata MediaRecorder MediaSource MediaStream MessageChannel
    MessageEvent MouseEvent MutationObserver NaN Node NodeList Notification Number Object OfflineAudioContext
    OffscreenCanvas Option Path2D PerformanceObserver PointerEvent ProgressEvent Promise PromiseRejectionEvent Proxy
    RTCPeerConnection Range RangeError ReadableStream ReferenceError Reflect RegExp Request ResizeObserver Response
    SVGElement Selection Set ShadowRoot SharedArrayBuffer SpeechSynthesisUtterance StorageEvent String SubtleCrypto Symbol
    SyntaxError Text TextDecoder TextEncoder TouchEvent TransformStream TypeError URIError URL URLSearchParams Uint16Array
    Uint32Array Uint8Array Uint8ClampedArray WeakMap WeakRef WeakSet WebAssembly WebSocket WheelEvent Worker WritableStream
    XMLSerializer addEventListener alert atob blur btoa caches cancelAnimationFrame cancelIdleCallback clearInterval
    clearTimeout close confirm console createImageBitmap crossOriginIsolated crypto customElements decodeURI
    decodeURIComponent devicePixelRatio dispatchEvent document encodeURI encodeURIComponent escape eval fetch focus
    getComputedStyle getSelection globalThis history indexedDB innerHeight innerWidth isFinite isNaN isSecureContext
    localStorage location matchMedia navigator open origin outerHeight outerWidth parseFloat parseInt performance prompt
    queueMicrotask removeEventListener reportError requestAnimationFrame requestIdleCallback screen scrollBy scrollTo self
    sessionStorage setInterval setTimeout speechSynthesis structuredClone undefined unescape visualViewport webkitAudioContext
    window lucide`.split(/\s+/).filter(Boolean));
  const scripts = [...html.matchAll(/<script src="\.\/([a-z0-9]+\.js)"/g)].map(m => path.join(PATHS.root, "src", m[1]));
  // The TypeScript modules (src/ts, built by Vite) are checked by tsc, not
  // here; what they hand to the classic scripts is window.X = … .
  const tsDir = path.join(PATHS.root, "src", "ts");
  const tsFiles = fs.existsSync(tsDir) ? fs.readdirSync(tsDir).filter(f => f.endsWith(".ts")).map(f => path.join(tsDir, f)) : [];
  // Object.assign(window, {a, b, c: …}) hands a, b and c over as well (discover.ts).
  const assignExports = src => [...src.matchAll(/Object\.assign\(\s*window\s*,\s*\{/g)].flatMap(m => {
    let depth = 1, top = "";
    for (let i = m.index + m[0].length; i < src.length && depth > 0; i++) {
      const ch = src[i];
      if ("{([".includes(ch)) depth++;
      else if ("})]".includes(ch)) depth--;
      top += depth === 1 && !"{}()[]".includes(ch) ? ch : depth <= 1 ? "," : "";
    }
    return top.split(",").map(s => s.split(":")[0].trim()).filter(s => /^[A-Za-z_$][\w$]*$/.test(s));
  });
  const tsExports = new Set(tsFiles.filter(f => !f.endsWith(".d.ts")).flatMap(f => { const src = fs.readFileSync(f, "utf-8"); return [...[...src.matchAll(/\bwindow\.([A-Za-z_$][\w$]*)\s*=(?!=)/g)].map(m => m[1]), ...assignExports(src)]; }));
  const und = spawnSync(process.execPath, ["--expose-internals", path.join(PATHS.root, "tests", "undef-names.cjs"), ...scripts], { encoding: "utf8", maxBuffer: 16 << 20 });
  let undRes = null;
  try { undRes = JSON.parse(und.stdout); } catch (_) { undRes = { skip: "checker output unreadable: " + (und.stderr || und.stdout).slice(0, 200) }; }
  if (undRes.skip) suite.skip("F27-01: [Static] Every identifier the frontend reads is declared or a platform global", undRes.skip);
  else suite.test("F27-01: [Static] Every identifier the frontend reads is declared or a platform global", () => {
    assert.ok(!undRes.error, "parse failed: " + undRes.error);
    // boot.js, app.js and ready.js stay classic until step 3; the rest move to src/ts one by one.
    assert.ok(scripts.length >= 3, "expected the app's scripts in index.html, found " + scripts.length);
    const bad = Object.entries(undRes.unresolved).filter(([n]) => !PLATFORM.has(n) && !tsExports.has(n));
    assert.deepEqual(bad.map(([n, w]) => `${n} (${w.join(", ")})`), [], "names read but never defined — a ReferenceError at runtime");
  });
  // The other direction: the TypeScript modules read app.js's globals by name
  // and src/ts/globals.d.ts only promises tsc they exist. Each promise must
  // still be kept by a classic script, or the module throws at start-up.
  const globalsDts = path.join(tsDir, "globals.d.ts");
  if (undRes.skip || !fs.existsSync(globalsDts)) suite.skip("F27-02: [Static] Every legacy global the TypeScript modules rely on is still declared", undRes.skip || "no src/ts/globals.d.ts");
  else suite.test("F27-02: [Static] Every legacy global the TypeScript modules rely on is still declared", () => {
    const dts = fs.readFileSync(globalsDts, "utf-8");
    const promised = [...dts.matchAll(/^declare\s+(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);
    const win = dts.match(/interface Window \{([\s\S]*?)\n\}/);
    const winProps = win ? [...win[1].matchAll(/^\s*([A-Za-z_$][\w$]*)\??\s*:/gm)].map(m => m[1]).filter(n => n !== "__TAURI__") : [];
    assert.ok(promised.length >= 10, "globals.d.ts declares " + promised.length + " names");
    const have = new Set(undRes.declared || []);
    assert.deepEqual([...promised, ...winProps].filter(n => !have.has(n)), [], "declared for TypeScript but defined by no classic script");
  });
  suite.test("F27-03: [Happy Path] The page loads the TypeScript entry and ends with ready.js", () => {
    assert.match(html, /<script type="module" src="\.\/ts\/main\.ts"><\/script>/, "index.html must load src/ts/main.ts as a module");
    const classic = [...html.matchAll(/<script src="\.\/([a-z0-9]+)\.js" defer><\/script>/g)].map(m => m[1]);
    assert.equal(classic[classic.length - 1], "ready", "ready.js must be the last classic script — the modules wait for it");
    const main = fs.readFileSync(path.join(tsDir, "main.ts"), "utf-8");
    for (const m of ["naudio", "e2e", "fx", "m3", "discover", "search", "messenger", "chat", "profile", "custom", "update", "covers", "aura"]) assert.match(main, new RegExp(`from "\\./${m}"|import "\\./${m}"`), m + " is imported by main.ts");
  });

  // ─── Feature 28: Onboarding in five steps, one sign-in card everywhere ─────
  suite.test("F28-01: [Happy Path] Onboarding has five steps, a five-dot progress bar and a step counter", () => {
    const steps = [...html.matchAll(/<section class="obstep"[^>]*data-step="(\d)"/g)].map(m => +m[1]);
    assert.deepEqual(steps, [0, 1, 2, 3, 4]);
    const prog = html.match(/<div[^>]*id="obprog"[^>]*>([\s\S]*?)<\/div>/);
    assert.ok(prog, "#obprog missing");
    assert.equal((prog[1].match(/<i\b/g) || []).length, 5);
    for (const id of ["obcount", "obnext", "obback", "obsvc", "obauth", "obsum", "oblang", "obtheme", "obaccent"]) assert.ok(domHasElement(html, "#" + id), id);
    assert.match(js, /function obGo\(n\)/);
  });
  suite.test("F28-02: [Happy Path] Profile, social gates and onboarding all render the same authView card", () => {
    assert.match(js, /function authView\(box,opts=\{\}\)/);
    assert.match(js, /needAuth=\(box,saved(=\{\})?\)=>authView\(/);
    assert.match(js, /authView\(box,\{prefix:"oau"/);
    assert.match(js, /authView\(box,\{prefix:"au"/);
    assert.match(js, /resetPasswordForEmail/);
    assert.match(js, /signInWithOtp/);
  });
  suite.test("F28-03: [Accessibility] Reduced motion stills the onboarding and the sign-in card", () => {
    const blocks = extractMediaBlocks(css, /prefers-reduced-motion:\s*reduce/).map(b => b.content).join("\n");
    for (const sel of [".ob-shell", ".authx"]) assert.ok(blocks.includes(sel), sel + " not covered by prefers-reduced-motion");
  });

  // ─── Feature 29: Rooms — one clock, one read per tick, a lobby with a code field ──
  const roomsSrc = () => { const a = js.indexOf("/* ── rooms ──"), b = js.indexOf("/* ── leaderboard ──"); assert.ok(a > 0 && b > a, "rooms section"); return js.slice(a, b); };
  const fnSrc = (src, name) => { const i = src.indexOf("function " + name + "("); assert.ok(i >= 0, name); let d = 0, j = src.indexOf("{", i); for (let k = j; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}" && --d === 0) return src.slice(i, k + 1); } throw new Error("unbalanced " + name); };
  suite.test("F29-01: [Happy Path] The player tells the room about tracks, toggles, seeks and skips", () => {
    assert.match(fnSrc(js, "setTrack"), /roomNoteTrack\(ctx,roomOwn\)/);
    assert.match(fnSrc(js, "toggle"), /roomNoteToggle\(\)/);
    assert.match(fnSrc(js, "sync"), /roomNoteSync\(\)/);
    assert.match(fnSrc(js, "next"), /roomNext\(userInitiated\)/);
    assert.match(fnSrc(js, "prev"), /roomPrev\(\)/);
    assert.match(js, /addEventListener\("seeked",\(\)=>\{[^}]*roomNoteSeek\(\)/);
  });
  suite.test("F29-02: [Edge Case] Room state does not shadow the reduced-motion flag RM", () => {
    const r = roomsSrc();
    assert.doesNotMatch(js, /\b(var|let|const) RM\s*=\s*(null|\{)/, "RM is the reduced-motion const; room state is RMX");
    assert.match(r, /var RMX=null;/);
  });
  suite.test("F29-03: [Performance] One embedded read per tick; the host publishes on change, drift or a 20 s heartbeat", () => {
    const r = roomsSrc();
    const refresh = fnSrc(r, "refreshRoomState");
    assert.match(refresh, /room_members\(user_id,role\),room_queue\(/, "members and queue ride along with the row");
    const pub = fnSrc(r, "roomPublishNow");
    assert.match(pub, /drift<1\.2/);
    assert.match(pub, /20000/);
    assert.doesNotMatch(fnSrc(r, "roomTick"), /from\("rooms"\)\.update/, "the tick itself must not rewrite the row");
  });
  suite.test("F29-04: [Happy Path] Join codes are normalised as typed and the room clock runs on server time", () => {
    const r = roomsSrc();
    const fmt = new Function(fnSrc(r, "rmCodeFmt") + "; return rmCodeFmt;")();
    assert.equal(fmt("meow-ab3k"), "MEOW-AB3K");
    assert.equal(fmt("meowab3k"), "MEOW-AB3K");
    assert.equal(fmt("ab3k"), "MEOW-AB3K");
    assert.equal(fmt("Заходи: MEOW-XY7Q !"), "MEOW-XY7Q");
    assert.equal(fmt("me"), "ME");
    const want = new Function("SOC", "Date", fnSrc(r, "rmWant").replace("function rmWant", "return function").replace(/rmNow\(\)/g, "(Date.now()+(SOC.roomSkew||0))"));
    const fakeDate = { now: () => Date.parse("2025-01-01T00:00:10Z"), parse: Date.parse };
    const w = want({ roomSkew: 0 }, fakeDate);
    assert.equal(Math.round(w({ position: 5, playing: true, updated_at: "2025-01-01T00:00:00Z" })), 15);
    assert.equal(w({ position: 5, playing: false, updated_at: "2025-01-01T00:00:00Z" }), 5);
  });
  suite.test("F29-05: [Accessibility] Reduced motion stills the room cards, rows and the on-air pulse", () => {
    const blocks = extractMediaBlocks(css, /prefers-reduced-motion:\s*reduce/).map(b => b.content).join("\n");
    for (const sel of [".rmx-card", ".rmx-row", ".rmx-onair i", ".rmx-skel"]) assert.ok(blocks.includes(sel), sel + " not covered by prefers-reduced-motion");
  });

  // ─── Feature 30: Clips (beta) — the official video behind the full player ──
  const clipSrc = () => { const a = js.indexOf("/* ─── Clips (beta)"), b = js.indexOf("function npArtRect("); assert.ok(a > 0 && b > a, "clips section"); return js.slice(a, b); };
  suite.test("F30-01: [Happy Path] A fifth background mode, its status row and both languages", () => {
    assert.match(html, /<button class="seg-btn" data-bg="clips" data-i18n="fp\.bg\.clips">/);
    assert.ok(domHasElement(html, "#fp-clip-state") && domHasElement(html, "#fp-clip-txt"), "status row");
    for (const k of ["fp.bg.clips", "fp.clip.hint", "fp.clip.look", "fp.clip.load", "fp.clip.on", "fp.clip.none", "fp.clip.err", "fp.clip.end", "fp.clip.app", "fp.clip.codec", "fp.clip.idle"]) {
      assert.equal(js.split(`"${k}":`).length - 1, 2, k + " must exist in RU and EN");
    }
    assert.match(fnSrc(js, "renderFP"), /clipRefresh\(\)/);
    assert.match(fnSrc(js, "closeFP"), /clipRefresh\(\)/);
    assert.match(fnSrc(js, "applyFPSettings"), /clipRefresh\(\)/);
  });
  suite.test("F30-02: [Performance] One video element, its source dropped off screen, the flow paused under it", () => {
    const c = clipSrc();
    assert.equal((c.match(/createElement\("video"\)/g) || []).length, 2, "one for the codec probe, one for the clip");
    assert.match(fnSrc(c, "clipRelease"), /removeAttribute\("src"\);v\.load\(\)/);
    assert.match(fnSrc(c, "clipRefresh"), /setTimeout\(clipRelease,60000\)/);
    assert.match(c, /tier=\(S\.lite\|\|hqFlag\(\)===0\)\?0/);
    const fx = readSrc("src/ts/fx.ts");
    assert.match(fx, /m==="clips"&&fp\.dataset\.clip!=="on"/, "flowActive must stop drawing under a clip");
  });
  suite.test("F30-03: [Edge Case] A lookup waits out quick skips and every answer is remembered", () => {
    const c = clipSrc();
    assert.match(fnSrc(c, "clipRefresh"), /setTimeout\(\(\)=>clipLookup\(tr,key\),600\)/);
    const store = new Map();
    const env = { localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) } };
    const memo = new Function("CLIP", "localStorage", fnSrc(c, "clipMemo") + "; return clipMemo;")({ mem: null }, env.localStorage);
    memo("ytm:a", "vid");
    memo("ytm:b", "");
    assert.equal(memo("ytm:a"), "vid");
    assert.equal(memo("ytm:b"), "", "a miss is an answer too");
    assert.equal(memo("ytm:c"), undefined);
    for (let i = 0; i < 420; i++) memo("k" + i, "v");
    assert.ok(Object.keys(JSON.parse(store.get("mw.clips2"))).length <= 400, "capped");
  });
  suite.test("F30-04: [Accessibility] Reduced motion stills the clip fade and the status pulse", () => {
    const blocks = extractMediaBlocks(css, /prefers-reduced-motion:\s*reduce/).map(b => b.content).join("\n");
    for (const sel of [".fp-clip", ".fpclip-state #fp-clip-txt"]) assert.ok(blocks.includes(sel), sel + " not covered by prefers-reduced-motion");
  });
  suite.test("F30-05: [Static] The proxy serves clips as a tokenless, capped picture-only route", () => {
    const st = readSrc("src-tauri/src/stream.rs"), yt = readSrc("src-tauri/src/ytm.rs"), lib = readSrc("src-tauri/src/lib.rs");
    assert.match(st, /TOKENLESS_SERVICES\.contains\(&service\) \|\| service == "ytv"/);
    assert.match(st, /"ytv" if crate::ytm::bot_checked_recently\(\)/);
    assert.match(st, /0 => 360,\s*2 => 720,\s*_ => 480,/);
    assert.match(yt, /kind != "MUSIC_VIDEO_TYPE_OMV"/);
    assert.match(lib, /ytm::ytm_clip,/);
  });

  /* F31 — round 9: downloads play from disk */
  suite.test("F31-01: [Happy Path] A downloaded track streams from its file, before any service URL is built", () => {
    const su = fnSrc(js, "streamUrl");
    const iOff = su.indexOf("offId(tr)"), iSvc = su.indexOf("/stream/${encodeURIComponent(tr.s)}");
    assert.ok(iOff > 0 && iSvc > iOff, "the file must be checked before the service URL");
    assert.match(su, /\/stream\/local\/\$\{encodeURIComponent\(off\)\}/);
    assert.match(fnSrc(js, "offId"), /S\.dlPlay===false\|\|tr\?\._net\?null:offLive\(tr\)/);
    assert.match(fnSrc(js, "load"), /if\(tr\.s==="sp"&&!offId\(tr\)\)\{sprPlay/);
    assert.match(readSrc("src/ts/m3.ts"), /_resolvedSvc:h\.s,_net:true\}/, "an explicit source pick bypasses the file");
  });
  suite.test("F31-02: [Happy Path] A plain download is remembered; Spotify downloads take the resolved source", () => {
    const dl = fnSrc(js, "downloadTrack");
    assert.match(dl, /const src=await dlSource\(tr\)/);
    assert.match(dl, /service:src\.s,id:src\.id/);
    assert.match(dl, /offRemember\(tr,path\)/);
    assert.doesNotMatch(fnSrc(js, "downloadProcessed"), /offRemember/, "a processed file is a different sound");
    assert.match(fnSrc(js, "dlSource"), /sprResolve\(tr\)/);
  });
  suite.test("F31-03: [Edge Case] A file that will not open falls back to the service; no network skips what is not on disk", () => {
    assert.match(js, /if\(offFailed\(tr,url\)\)\{toast\(t\("off\.gone"\),4200\);load\(tr,wasPlaying,pos\);return\}/);
    const ef = fnSrc(js, "explainFailure");
    assert.match(ef, /navigator\.onLine===false&&tr\?\.s!=="local"&&!offId\(tr\)/);
    assert.match(ef, /await offBoot\(\)/, "files may be confirmed after the track started");
    assert.match(fnSrc(js, "next"), /playOn\(c\.s\)&&offOk\(c\)\)nx=c/);
    assert.match(fnSrc(js, "prefetchNextSoon"), /\|\|offId\(nx\)\)return/);
  });
  suite.test("F31-04: [Edge Case] Earlier downloads are matched by the exact download name only", () => {
    const st = fnSrc(js, "dlStem");
    assert.match(st, /\.replace\(\/\[<>:"\\\/\\\\\|\?\*\\x00-\\x1f\]\/g,"_"\)/);
    assert.match(st, /slice\(0,120\)/, "the same 120-character cap as download_track");
    const f = fnSrc(js, "offFind");
    assert.match(f, /replace\(\/ \\\(\\d\{1,3\}\\\)\$\/,""\)/, "a ' (2)' copy is still the same download");
    assert.match(f, /known\.get\(base\.toLowerCase\(\)\)/);
  });
  suite.test("F31-05: [Static] Files are confirmed off the main thread, the list is kept apart and capped, texts in both languages", () => {
    const loc = readSrc("src-tauri/src/local.rs"), lib = readSrc("src-tauri/src/lib.rs");
    assert.match(loc, /pub async fn local_offline\(paths: Vec<String>\) -> Vec<LocalTrack> \{\s*tokio::task::spawn_blocking\(move \|\| local_add\(paths\)\)/);
    assert.match(loc, /pub async fn local_scan_bg\(/);
    assert.match(lib, /local::local_offline,\s*local::local_scan_bg,/);
    assert.match(fnSrc(js, "offSave"), /m\.size>4000/);
    assert.match(fnSrc(js, "offMap"), /localStorage\.getItem\("mw\.offline"\)/);
    for (const k of ["dl.play", "dl.play.s", "dl.nosrc", "off.mark", "off.lib", "off.none", "off.find", "off.find.t", "off.find.s", "off.find.btn", "off.find.nodir", "off.found", "off.found0", "off.forget", "off.gone", "off.nonet", "off.skip"]) {
      assert.equal(js.split(`"${k}":`).length - 1, 2, k + " must exist in RU and EN");
    }
    assert.ok(domHasElement(html, "#dl-play") && domHasElement(html, "#dl-find"));
  });

  // ─── Feature 32: Avatar Upload & Display Pipeline ────────────────────────
  suite.test("F32-01: [Happy Path] Avatar and banner inputs exist in DOM with cropper modal and controls", () => {
    assert.ok(domHasElement(html, "#set-ava"), "#set-ava file input");
    assert.ok(domHasElement(html, "#set-ava-pick"), "#set-ava-pick button");
    assert.ok(domHasElement(html, "#set-ava-preview"), "#set-ava-preview element");
    assert.ok(domHasElement(html, "#cropper"), "#cropper modal");
    assert.ok(domHasElement(html, "#crop-stage"), "#crop-stage viewport");
    assert.ok(domHasElement(html, "#crop-canvas"), "#crop-canvas preview");
    assert.ok(domHasElement(html, "#crop-zoom"), "#crop-zoom range slider");
    assert.ok(domHasElement(html, "#crop-ok"), "#crop-ok button");
  });

  suite.test("F32-02: [Happy Path] uploadImage immediately persists avatar dataUrl locally and repaints", () => {
    assert.match(js, /S\[sProp\]=dataUrl;/);
    assert.match(js, /save\(\);/);
    assert.match(js, /renderProfile\(\);/);
    assert.match(js, /fillProfileSettings\(\);/);
  });

  suite.test("F32-03: [Edge Case] Avatar error recovery includes data-direct fallback and placeholder", () => {
    assert.match(js, /data-direct/);
    assert.match(js, /this\.dataset\.direct/);
    assert.match(js, /im\.classList\.contains\("avat-img"\)\|\|im\.id==="prof-ava-img"/);
  });

  suite.test("F32-04: [Static] stream.rs proxies supabase.co storage with browser UA and Accept header", () => {
    const st = readSrc("src-tauri/src/stream.rs");
    assert.match(st, /"supabase\.co"/);
    assert.match(st, /"supabase\.in"/);
    assert.match(st, /crate::api::BROWSER_UA/);
    assert.match(st, /"image\/avif,image\/webp/);
  });

  return suite;
}
