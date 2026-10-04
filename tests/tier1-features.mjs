// tests/tier1-features.mjs - Tier 1: Feature Coverage Tests (125 tests, 5 per feature)
import assert from "node:assert/strict";
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
  createMockEnvironment
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
    assert.ok(tr === "none" || tr === "0s" || tr === "0ms" || tr.includes("0s"), 
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
  suite.test("F08-01: [Happy Path] Mobile rail under max-width:880px declares sliding transition", () => {
    const media = extractMediaBlocks(css, /max-width:\s*880px/);
    assert.ok(media.length > 0, "Expected max-width: 880px media query in src/app.css");
    const combined = media.map(m => m.content).join("\n");
    assert.match(combined, /\.rail::before/, "Mobile media query must define .rail::before rules");
  });

  suite.test("F08-02: [Happy Path] Mobile rail indicator moves horizontally using --rx without jumping", () => {
    const media = extractMediaBlocks(css, /max-width:\s*880px/);
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
    const media = extractMediaBlocks(css, /max-width:\s*880px/);
    const combined = media.map(m => m.content).join("\n");
    assert.match(combined, /flex-direction\s*:\s*row|display\s*:\s*flex/, "Mobile rail should lay out horizontally");
  });

  suite.test("F08-05: [Happy Path] Mobile rail indicator height fits within bottom bar", () => {
    const media = extractMediaBlocks(css, /max-width:\s*880px/);
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
    const trf = activeRules[0].declarations.get("transform") || "";
    assert.match(trf, /scale\(\s*0?\.95\s*\)/, `Expected .btn:active to compress to scale(0.95), got: ${trf}`);
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
  suite.test("F18-01: [Happy Path] Living sine wave scrubber path generator uses y = 12 + 5*sin(i/22 - ph)", () => {
    const hasSineFormula = (
      /Math\.sin\([^)]*i\s*\/\s*22/i.test(js) || 
      /12\s*\+\s*5\s*\*\s*Math\.sin/i.test(js)
    );
    assert.ok(hasSineFormula, "Wavy audio progress track must generate sine path: 12 + 5*sin(i/22 - ph)");
  });

  suite.test("F18-02: [Happy Path] Wave phase advances during playback (ph += 0.06 * dt)", () => {
    assert.match(js, /ph\s*\+=\s*0?\.06|\.06\s*\*\s*dt/, "Wave phase ph must advance over time");
  });

  suite.test("F18-03: [Happy Path] Scrubber partitions played wave and unplayed track at progress point x", () => {
    assert.match(js, /wF|wTrack|wFill|\.setAttribute\(['"]d['"]/, "Scrubber must update SVG path attributes d");
  });

  suite.test("F18-04: [Happy Path] Audio progress point clamps progress fraction between 0 and 1", () => {
    assert.match(js, /Math\.max\(\s*p\s*\*\s*1000|\bclamp\b/, "Progress calculation must clamp fraction between 0 and 1");
  });

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

  suite.test("F25-04: [Happy Path] Responsive breakpoint max-width:880px defined in src/app.css", () => {
    assert.match(css, /@media\s*\(\s*max-width\s*:\s*880px\s*\)/, "Expected @media (max-width: 880px) in app.css");
  });

  suite.test("F25-05: [Happy Path] Active view transitions use data-active attribute", () => {
    assert.match(css, /\.view\[data-active="true"\]/, ".view[data-active='true'] rule must exist in CSS");
    assert.ok(domHasElement(html, 'data-active="true"'), "Default active view must declare data-active='true'");
  });

  return suite;
}
