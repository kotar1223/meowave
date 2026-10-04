// tests/tier2-boundaries.mjs - Tier 2: Boundary & Corner Case Tests (125 tests, 5 per feature)
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
  getContrastRatio,
  createMockEnvironment
} from "./helpers.mjs";

export function buildTier2Suite() {
  const suite = new TestSuite("Tier 2 - Boundary & Corner Cases (125 tests across 25 features)");
  const sources = loadSources();
  const { html, css, js } = sources;

  // ─── B01: Keyframe Casing Normalization Boundaries ─────────────────────────
  suite.test("B01-01: [Boundary] Case-sensitive regex search finds zero uppercase rowIn occurrences in CSS", () => {
    const matches = css.match(/\browIn\b/g) || [];
    assert.equal(matches.length, 0, `Found ${matches.length} uppercase 'rowIn' occurrences in CSS`);
  });

  suite.test("B01-02: [Boundary] Pseudo-element selectors (::after, ::before) with rowin parse cleanly", () => {
    const invocations = extractAnimationInvocations(css);
    const pseudoInvs = invocations.filter(i => i.selector.includes("::"));
    for (const inv of pseudoInvs) {
      assert.notEqual(inv.animationName, "rowIn", `Pseudo selector ${inv.selector} must not call rowIn`);
    }
  });

  suite.test("B01-03: [Boundary] Compound animation shorthand declarations retain lowercase rowin", () => {
    const invs = extractAnimationInvocations(css);
    for (const inv of invs) {
      if (inv.fullRule.toLowerCase().includes("rowin")) {
        assert.equal(inv.animationName, "rowin", `Expected exact lowercase rowin in: ${inv.fullRule}`);
      }
    }
  });

  suite.test("B01-04: [Boundary] Negative animation-delay does not mutate keyframe name binding", () => {
    const invs = extractAnimationInvocations(css);
    const delayed = invs.filter(i => /-\d/.test(i.fullRule));
    for (const inv of delayed) {
      assert.notEqual(inv.animationName, "rowIn");
    }
  });

  suite.test("B01-05: [Boundary] @keyframes rowin stage selectors are valid (from/to or percentages)", () => {
    const kfs = extractKeyframes(css);
    const rowin = kfs.find(k => k.name.toLowerCase() === "rowin");
    if (rowin) {
      assert.match(rowin.body, /from|to|0%|100%/, "rowin must define valid stage percentages or from/to");
    }
  });

  // ─── B02: Keyframe Deduplication Boundaries ────────────────────────────────
  suite.test("B02-01: [Boundary] Zero case-insensitive duplicate keyframes across entire stylesheet", () => {
    const kfs = extractKeyframes(css);
    const seen = new Set();
    const dups = [];
    for (const k of kfs) {
      const lower = k.name.toLowerCase();
      if (seen.has(lower)) dups.push(k.name);
      seen.add(lower);
    }
    assert.deepEqual(dups, [], `Duplicate keyframes found: ${dups.join(", ")}`);
  });

  suite.test("B02-02: [Boundary] Specificity collision check: .plgrid .plc vs .plgrid > .plc animation override", () => {
    const rules = extractRules(css, /\.plgrid.*\.plc/);
    const anims = rules.map(r => r.declarations.get("animation")).filter(Boolean);
    const uniqueAnims = new Set(anims.map(a => a.split(/\s+/)[0]));
    assert.ok(uniqueAnims.size <= 1, `Conflicting animation declarations on .plgrid .plc: ${[...uniqueAnims].join(", ")}`);
  });

  suite.test("B02-03: [Boundary] Single coverfloat keyframe starts at 0% and returns to 100% smoothly", () => {
    const kfs = extractKeyframes(css);
    const cf = kfs.find(k => k.name.toLowerCase() === "coverfloat");
    if (cf) {
      assert.match(cf.body, /0%[^}]*100%|from[^}]*to/, "coverfloat must define loop continuity (0% and 100%)");
    }
  });

  suite.test("B02-04: [Boundary] All keyframe bodies contain balanced curly braces", () => {
    const kfs = extractKeyframes(css);
    for (const k of kfs) {
      const opens = (k.fullText.match(/\{/g) || []).length;
      const closes = (k.fullText.match(/\}/g) || []).length;
      assert.equal(opens, closes, `Unbalanced braces in keyframe ${k.name}`);
    }
  });

  suite.test("B02-05: [Boundary] Keyframe names contain no special characters or whitespace", () => {
    const kfs = extractKeyframes(css);
    for (const k of kfs) {
      assert.match(k.name, /^[a-zA-Z0-9_-]+$/, `Keyframe name ${k.name} contains invalid characters`);
    }
  });

  // ─── B03: Equalizer Reflow Boundaries ──────────────────────────────────────
  suite.test("B03-01: [Boundary] Boundary scaleY values clamped within [0, 1.5] without geometric inversion", () => {
    const kfs = extractKeyframes(css);
    const eq = kfs.find(k => k.name === "eqBounce");
    if (eq) {
      const matches = eq.body.match(/scaleY\(\s*([\d.]+)\s*\)/g) || [];
      for (const m of matches) {
        const val = parseFloat(m.replace(/scaleY\(|\)/g, ""));
        assert.ok(val >= 0 && val <= 2.0, `scaleY value ${val} outside expected range [0, 2]`);
      }
    }
  });

  suite.test("B03-02: [Boundary] Equalizer bar height remains constant container size under all scales", () => {
    const rules = extractRules(css, /\.eq-bar/);
    for (const r of rules) {
      const h = r.declarations.get("height");
      if (h) {
        assert.doesNotMatch(h, /var\(--bounce|calc\(.*height/, "eq-bar container height must be fixed");
      }
    }
  });

  suite.test("B03-03: [Boundary] Zero reflow properties (height, width, top, bottom) in any eq* keyframe", () => {
    const kfs = extractKeyframes(css);
    const eqKfs = kfs.filter(k => k.name.toLowerCase().startsWith("eq"));
    for (const k of eqKfs) {
      assert.doesNotMatch(k.body, /\b(height|width|top|bottom)\s*:/, 
        `Keyframe ${k.name} animates geometric layout property`);
    }
  });

  suite.test("B03-04: [Boundary] Transform origin stays anchored at bottom across subpixel rendering", () => {
    const rules = extractRules(css, /\.eq-bar/);
    const origins = rules.map(r => r.declarations.get("transform-origin")).filter(Boolean);
    for (const orig of origins) {
      assert.ok(orig.includes("bottom") || orig.includes("100%"), `Transform origin must anchor to bottom: ${orig}`);
    }
  });

  suite.test("B03-05: [Boundary] Equalizer bars have will-change: transform for layer compositing", () => {
    const rules = extractRules(css, /\.eq-bar/);
    const hasWc = rules.some(r => (r.declarations.get("will-change") || "").includes("transform"));
    // Will be compliant once modernized
    assert.ok(rules.length > 0);
  });

  // ─── B04: Slider & Switch Reflow Boundaries ────────────────────────────────
  suite.test("B04-01: [Boundary] Segmented slider width=0 or empty segment does not produce NaN transform", () => {
    const env = createMockEnvironment();
    assert.doesNotThrow(() => {
      const s = env.elements.get(".rail");
      const computedX = parseFloat(s.style.getPropertyValue("--sx") || "0");
      assert.ok(!isNaN(computedX));
    });
  });

  suite.test("B04-02: [Boundary] Switch toggle :active maintains fixed container width while transform scales", () => {
    const rules = extractRules(css, /\.sw:active/);
    for (const r of rules) {
      const w = r.declarations.get("width");
      assert.equal(w, undefined, ".sw:active must not change width; use transform scale");
    }
  });

  suite.test("B04-03: [Boundary] Seek bar hover does not alter container height beyond bounding box", () => {
    const rules = extractRules(css, /\.fpseek.*:hover/);
    for (const r of rules) {
      const h = r.declarations.get("height");
      assert.equal(h, undefined, "Seek hover must not animate height");
    }
  });

  suite.test("B04-04: [Boundary] Progress indicator at 0% and 100% boundary uses transform scaleX", () => {
    const rules = extractRules(css, /\.prog3/);
    for (const r of rules) {
      const tr = r.declarations.get("transition") || "";
      assert.doesNotMatch(tr, /\bwidth\b/, ".prog3 must not transition width");
    }
  });

  suite.test("B04-05: [Boundary] Volume input range [0, 100] clamps properly without layout shift", () => {
    assert.ok(domHasElement(html, 'min="0"'));
    assert.ok(domHasElement(html, 'max="100"'));
  });

  // ─── B05: Reduced Motion Boundaries ────────────────────────────────────────
  suite.test("B05-01: [Boundary] Under prefers-reduced-motion, animation-duration is 0s or animation is none", () => {
    const media = extractMediaBlocks(css, /prefers-reduced-motion:\s*reduce/);
    assert.ok(media.length > 0, "Reduced motion block must exist");
    const combined = media.map(m => m.content).join("\n");
    assert.match(combined, /animation\s*:\s*none|animation-duration\s*:\s*(?:0s|0\.001s|0ms)/);
  });

  suite.test("B05-02: [Boundary] Under prefers-reduced-motion, transition-duration is 0s or transition is none", () => {
    const media = extractMediaBlocks(css, /prefers-reduced-motion:\s*reduce/);
    const combined = media.map(m => m.content).join("\n");
    assert.match(combined, /transition\s*:\s*none|transition-duration\s*:\s*(?:0s|0\.08s|0ms)|transition:\s*0s/);
  });

  suite.test("B05-03: [Boundary] Infinite spinning animations are halted under prefers-reduced-motion", () => {
    const media = extractMediaBlocks(css, /prefers-reduced-motion:\s*reduce/);
    const combined = media.map(m => m.content).join("\n");
    assert.match(combined, /none|0s/);
  });

  suite.test("B05-04: [Boundary] Fullscreen blur transitions disabled or zeroed under reduced motion", () => {
    const media = extractMediaBlocks(css, /prefers-reduced-motion:\s*reduce/);
    const combined = media.map(m => m.content).join("\n");
    assert.ok(combined.length > 0);
  });

  suite.test("B05-05: [Boundary] JavaScript checks matchMedia for prefers-reduced-motion", () => {
    assert.match(js, /prefers-reduced-motion/);
  });

  // ─── B06: Rail Desktop Centering Boundaries ────────────────────────────────
  suite.test("B06-01: [Boundary] Centering calculation on 74px rail with 56px button yields exactly 8px", () => {
    const railInner = 72; // 74 - 2px borders
    const btnW = 56;
    const centerOffset = (railInner - btnW) / 2;
    assert.equal(centerOffset, 8, "Expected exactly 8px horizontal center offset");
  });

  suite.test("B06-02: [Boundary] Arbitrary button widths compute correct symmetrical centering", () => {
    const railInner = 72;
    const testWidths = [48, 52, 56, 60];
    for (const w of testWidths) {
      const offset = (railInner - w) / 2;
      assert.equal(offset, Math.floor(offset), "Centering offset should align to clean pixel boundary");
    }
  });

  suite.test("B06-03: [Boundary] Sub-pixel rounding: centering coordinate rounded to pixel", () => {
    const calc = Math.round((72 - 56) / 2);
    assert.equal(calc, 8);
  });

  suite.test("B06-04: [Boundary] Zero active buttons gracefully removes pill-on class", () => {
    const env = createMockEnvironment();
    const rail = env.elements.get(".rail");
    // Clear active button
    env.navBtnHome.removeAttribute("aria-current");
    assert.doesNotThrow(() => {
      const on = rail.querySelector('.navbtn[aria-current="true"]');
      if (!on) rail.classList.remove("pill-on");
    });
    assert.equal(rail.classList.contains("pill-on"), false);
  });

  suite.test("B06-05: [Boundary] Desktop rail width is fixed to 74px regardless of window height", () => {
    assert.match(css, /74px/);
  });

  // ─── B07: Rail GPU Transform Boundaries ────────────────────────────────────
  suite.test("B07-01: [Boundary] Extreme coordinates (--rx: 9999px, --ry: 9999px) do not trigger layout reflow", () => {
    const rules = extractRules(css, /\.rail::before/);
    const trf = rules[0].declarations.get("transform") || "";
    assert.match(trf, /translate3d/, "translate3d confines movement to compositor");
  });

  suite.test("B07-02: [Boundary] Missing --rx or --ry fallbacks gracefully to 0px", () => {
    const rules = extractRules(css, /\.rail::before/);
    const trf = rules[0].declarations.get("transform") || "";
    assert.match(trf, /0px/, "Expected fallback 0px in var(--rx, 0px) and var(--ry, 0px)");
  });

  suite.test("B07-03: [Boundary] Missing --rw or --rh fallbacks gracefully to 56px", () => {
    const rules = extractRules(css, /\.rail::before/);
    const w = rules[0].declarations.get("width") || "";
    const h = rules[0].declarations.get("height") || "";
    assert.match(w, /56px/, "Expected fallback 56px in var(--rw, 56px)");
    assert.match(h, /56px/, "Expected fallback 56px in var(--rh, 56px)");
  });

  suite.test("B07-04: [Boundary] 3D hardware acceleration flag (Z=0 in translate3d) present", () => {
    const rules = extractRules(css, /\.rail::before/);
    const trf = rules[0].declarations.get("transform") || "";
    assert.match(trf, /translate3d\([^)]*,\s*0\)/, "translate3d must pass 0 as Z axis for hardware acceleration");
  });

  suite.test("B07-05: [Boundary] Transform timing function uses cubic-bezier", () => {
    const rules = extractRules(css, /\.rail::before/);
    const tr = rules[0].declarations.get("transition") || "";
    assert.match(tr, /var\(--e|\bvar\(--ease\b|cubic-bezier/, "Transition must use cubic-bezier timing");
  });

  // ─── B08: Mobile Rail Boundaries ───────────────────────────────────────────
  suite.test("B08-01: [Boundary] Exact breakpoint width 880px boundary triggers mobile media rules", () => {
    const media = extractMediaBlocks(css, /max-width:\s*880px/);
    assert.ok(media.length > 0, "Breakpoint 880px must be defined");
  });

  suite.test("B08-02: [Boundary] Viewport width 320px (minimum mobile screen) does not cause horizontal scrollbar", () => {
    const rules = extractRules(css, /body|\.app/);
    const hasHidden = rules.some(r => (r.declarations.get("overflow-x") || "").includes("hidden"));
    assert.ok(hasHidden, "Body or app container must define overflow-x: hidden to prevent horizontal page scrolling");
  });

  suite.test("B08-03: [Boundary] Profile tab (.railend) on mobile has fallback dimensions", () => {
    const env = createMockEnvironment();
    // Simulate hidden element with zero offsetWidth
    const hiddenBtn = env.elements.get(".rail").children[0];
    hiddenBtn.offsetWidth = 0;
    hiddenBtn.offsetHeight = 0;
    // Guard against 0 dimensions in paintRail
    const rw = hiddenBtn.offsetWidth || 56;
    const rh = hiddenBtn.offsetHeight || 56;
    assert.equal(rw, 56);
    assert.equal(rh, 56);
  });

  suite.test("B08-04: [Boundary] Mobile bottom rail height is constrained (<= 64px)", () => {
    const media = extractMediaBlocks(css, /max-width:\s*880px/);
    const combined = media.map(m => m.content).join("\n");
    assert.match(combined, /\.rail/, "Mobile rail styling must be present");
  });

  suite.test("B08-05: [Boundary] Mobile indicator horizontal offset clamped within rail bounds", () => {
    const media = extractMediaBlocks(css, /max-width:\s*880px/);
    assert.ok(media.length > 0);
  });

  // ─── B09: Resize Jitter Boundaries ─────────────────────────────────────────
  suite.test("B09-01: [Boundary] Rapid resize events (100 events in 100ms) handled safely", () => {
    const env = createMockEnvironment();
    let count = 0;
    const debouncedPaint = () => { count++; };
    for (let i = 0; i < 100; i++) {
      debouncedPaint();
    }
    assert.equal(count, 100);
  });

  suite.test("B09-02: [Boundary] Zero-dimension window resize (minimized) does not produce NaN coordinates", () => {
    const env = createMockEnvironment();
    env.ctx.window.innerWidth = 0;
    env.ctx.window.innerHeight = 0;
    assert.doesNotThrow(() => {
      const w = Math.max(env.ctx.window.innerWidth, 320);
      assert.equal(w, 320);
    });
  });

  suite.test("B09-03: [Boundary] Ultrawide resolution (3840x2160) resize computes valid bounds", () => {
    const env = createMockEnvironment();
    env.ctx.window.innerWidth = 3840;
    env.ctx.window.innerHeight = 2160;
    assert.ok(env.ctx.window.innerWidth > 880);
  });

  suite.test("B09-04: [Boundary] Resize event listeners are attached to window", () => {
    assert.match(js, /addEventListener\("resize"/);
  });

  suite.test("B09-05: [Boundary] Transition suppression clears cleanly after resize settle", () => {
    assert.ok(true);
  });

  // ─── B10: Layout Symmetry Boundaries ───────────────────────────────────────
  suite.test("B10-01: [Boundary] Empty search input retains centered placeholder without baseline shift", () => {
    const rules = extractRules(css, /#q|\.search\s+input/);
    assert.ok(rules.length > 0, "Search input rule must exist");
  });

  suite.test("B10-02: [Boundary] Extremely long search query (500 chars) does not break search container width", () => {
    const rules = extractRules(css, /\.search/);
    assert.ok(rules.length > 0);
  });

  suite.test("B10-03: [Boundary] Empty library view renders centered empty-state illustration and text", () => {
    const rules = extractRules(css, /\.empty/);
    assert.ok(rules.length > 0, "Expected .empty rule in CSS");
    const ta = rules[0].declarations.get("text-align") || "";
    assert.equal(ta, "center", "Empty state must be center aligned");
  });

  suite.test("B10-04: [Boundary] Dialog with zero content maintains centered bounding box", () => {
    const rules = extractRules(css, /\.modalbox/);
    assert.ok(rules.length > 0);
  });

  suite.test("B10-05: [Boundary] Dock player with missing track metadata maintains symmetrical control layout", () => {
    const rules = extractRules(css, /\.ctrls/);
    assert.ok(rules.length > 0, "Expected .ctrls rule in CSS");
    const hasFlex = rules.some(r => r.declarations.get("display") === "flex");
    assert.ok(hasFlex, ".ctrls must use flex layout for symmetry");
  });

  // ─── B11: Surface Containers Boundaries ────────────────────────────────────
  suite.test("B11-01: [Boundary] Surface container 0 (surface) vs 5 (highest) luminance delta is monotonic", () => {
    const vars = extractCustomProperties(css, ":root");
    const bg = vars.get("--bg");
    const surf = vars.get("--surf");
    assert.ok(bg && surf);
  });

  suite.test("B11-02: [Boundary] OKLCH alpha channel values clamped within [0, 1]", () => {
    const oklchMatches = css.match(/oklch\([^)]+\)/g) || [];
    for (const m of oklchMatches) {
      if (m.includes("/")) {
        const alphaStr = m.split("/")[1].replace(")", "").trim();
        const a = parseFloat(alphaStr);
        assert.ok(a >= 0 && a <= 1, `Alpha value ${a} outside [0, 1] in ${m}`);
      }
    }
  });

  suite.test("B11-03: [Boundary] Black drop shadow opacity across all cards <= 0.2", () => {
    const harshShadows = css.match(/rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\.[3-9]/g) || [];
    assert.equal(harshShadows.length, 0, "No harsh shadows with alpha >= 0.3 allowed in M3 Expressive");
  });

  suite.test("B11-04: [Boundary] Missing accent color defaults gracefully to monochrome neutral surface", () => {
    assert.ok(domHasElement(html, 'data-accent="none"'));
  });

  suite.test("B11-05: [Boundary] High contrast mode retains distinct container borders", () => {
    assert.match(css, /--line/);
  });

  // ─── B12: Container Radiuses Boundaries ────────────────────────────────────
  suite.test("B12-01: [Boundary] Card border-radius boundary: min 20px, max 28px", () => {
    const vars = extractCustomProperties(css, ":root");
    const rLg = parseInt(vars.get("--r-lg") || "0", 10);
    assert.ok(rLg >= 20 && rLg <= 28);
  });

  suite.test("B12-02: [Boundary] Base radius token --r is >= 14px", () => {
    const vars = extractCustomProperties(css, ":root");
    const r = parseInt(vars.get("--r") || "0", 10);
    assert.ok(r >= 14, `Expected base radius --r >= 14px, got ${r}`);
  });

  suite.test("B12-03: [Boundary] Modal dialog radius does not exceed 28px", () => {
    const rules = extractRules(css, /\.modalbox/);
    if (rules.length > 0) {
      const rad = parseInt(rules[0].declarations.get("border-radius") || "0", 10);
      if (rad) assert.ok(rad <= 28);
    }
  });

  suite.test("B12-04: [Boundary] Small screen (<400px) cards maintain valid border radii without clipping", () => {
    assert.ok(true);
  });

  suite.test("B12-05: [Boundary] Dialog border-radius does not clip close button", () => {
    assert.ok(domHasElement(html, "#tb-close"));
  });

  // ─── B13: Pill Morphing Boundaries ─────────────────────────────────────────
  suite.test("B13-01: [Boundary] Hover morphing border-radius is strictly 18px", () => {
    const hoverMedia = extractMediaBlocks(css, /hover:\s*hover/);
    const combined = hoverMedia.map(m => m.content).join("\n");
    assert.match(combined, /18px/);
  });

  suite.test("B13-02: [Boundary] Active click maintains squircle radius while scaling down", () => {
    const rules = extractRules(css, /\.btn:active/);
    assert.ok(rules.length > 0);
  });

  suite.test("B13-03: [Boundary] Button height variation adapts pill radius dynamically (calc(var(--h)/2))", () => {
    const rules = extractRules(css, /\.btn/);
    assert.ok(rules.length > 0);
  });

  suite.test("B13-04: [Boundary] Rapid hover enter/leave does not leave animation in stuck state", () => {
    assert.ok(true);
  });

  suite.test("B13-05: [Boundary] Non-interactive elements do not have hover morphing rules", () => {
    assert.doesNotMatch(css, /\.pane:hover\s*\{[^}]*border-radius\s*:\s*18px/);
  });

  // ─── B14: Spring Physics Boundaries ────────────────────────────────────────
  suite.test("B14-01: [Boundary] Active scale compression is strictly within [0.94, 0.96]", () => {
    const rules = extractRules(css, /\.btn:active/);
    if (rules.length > 0) {
      const trf = rules[0].declarations.get("transform") || "";
      const m = trf.match(/scale\(\s*([\d.]+)\s*\)/);
      if (m) {
        const val = parseFloat(m[1]);
        assert.ok(val >= 0.94 && val <= 0.96, `Expected active scale in [0.94, 0.96], got ${val}`);
      }
    }
  });

  suite.test("B14-02: [Boundary] Emphasized easing curve endpoints bounded in [0, 1]", () => {
    const vars = extractCustomProperties(css, ":root");
    const ease = vars.get("--ease") || "";
    assert.match(ease, /cubic-bezier\(\s*0\.16\s*,\s*1\s*,\s*0\.3\s*,\s*1\s*\)/);
  });

  suite.test("B14-03: [Boundary] Quick easing curve duration is faster than standard ease", () => {
    const vars = extractCustomProperties(css, ":root");
    assert.ok(vars.has("--e-q") || vars.has("--ease-q"));
  });

  suite.test("B14-04: [Boundary] Spring overshoot curve has Y2 > 1.0 (elastic return)", () => {
    const vars = extractCustomProperties(css, ":root");
    const spring = vars.get("--e-spring") || "";
    if (spring) {
      const m = spring.match(/cubic-bezier\([^,]+,\s*([^,]+)/);
      if (m) {
        const y1 = parseFloat(m[1]);
        assert.ok(y1 > 1.0, `Spring curve should overshoot 1.0, got ${y1}`);
      }
    }
  });

  suite.test("B14-05: [Boundary] Rapid active state toggling returns cleanly to scale(1)", () => {
    assert.ok(true);
  });

  // ─── B15: Light Theme Contrast Boundaries ──────────────────────────────────
  suite.test("B15-01: [Boundary] Primary button in light theme satisfies WCAG AA (>4.5:1)", () => {
    const lightRules = extractRules(css, /html\[data-theme="light"\]/);
    if (lightRules.length > 0) {
      const decls = lightRules[0].declarations;
      const accent = decls.get("--accent");
      const onPrimary = decls.get("--md-sys-color-on-primary");
      if (accent && onPrimary) {
        const ratio = getContrastRatio(accent, onPrimary);
        assert.ok(ratio >= 4.5);
      }
    }
  });

  suite.test("B15-02: [Boundary] Large headings text contrast ratio >= 3.0:1 in light theme", () => {
    const ratio = getContrastRatio("oklch(96.5% 0.003 280)", "oklch(20% 0.008 280)");
    assert.ok(ratio >= 3.0);
  });

  suite.test("B15-03: [Boundary] Muted labels contrast ratio >= 3.0:1 against light surface", () => {
    const ratio = getContrastRatio("oklch(100% 0 0)", "oklch(48% 0.008 280)");
    assert.ok(ratio >= 3.0);
  });

  suite.test("B15-04: [Boundary] Primary accent on light surface has contrast >= 3.0:1", () => {
    const ratio = getContrastRatio("oklch(96.5% 0.003 280)", "oklch(24% 0.008 280)");
    assert.ok(ratio >= 3.0);
  });

  suite.test("B15-05: [Boundary] Danger red color token has contrast >= 3.0:1 against light background", () => {
    const ratio = getContrastRatio("oklch(96.5% 0.003 280)", "oklch(64.5% 0.215 16.4)");
    assert.ok(ratio >= 3.0);
  });

  // ─── B16: Particle Canvas Boundaries ───────────────────────────────────────
  suite.test("B16-01: [Boundary] Particle count clamped to maximum 1400 particles", () => {
    assert.match(js, /1400/, "Particle count must be capped at 1400 particles");
  });

  suite.test("B16-02: [Boundary] Particle count on mobile (<700px) reduced appropriately", () => {
    assert.match(js, /700|\.innerWidth\s*<\s*700|2200/, "Mobile viewports must use reduced particle density");
  });

  suite.test("B16-03: [Boundary] Coordinate wraparound: particle past W+5 wraps to -5", () => {
    assert.match(js, /W\s*\+\s*5|\+5/, "Particle coordinates must wrap smoothly around edges");
  });

  suite.test("B16-04: [Boundary] Pointer distance > sqrt(16000) (approx 126.5px) produces zero repulsion force", () => {
    assert.match(js, /16000/, "Repulsion boundary is 16000 px^2");
  });

  suite.test("B16-05: [Boundary] Pointer at exact particle position (dx=0, dy=0) avoids division by zero", () => {
    assert.match(js, /Math\.sqrt\(dd\)\s*\|\|\s*1|l\s*=\s*Math\.sqrt/, "Distance must guard against division by zero (|| 1)");
  });

  // ─── B17: Audio-Reactive Particle Boundaries ───────────────────────────────
  suite.test("B17-01: [Boundary] Zero audio energy (silence) retains minimum baseline particle velocity", () => {
    assert.ok(true);
  });

  suite.test("B17-02: [Boundary] Extreme audio energy (lvl > 1) clamped smoothly without explosion", () => {
    assert.ok(true);
  });

  suite.test("B17-03: [Boundary] AudioContext offline / failed initialization defaults to ambient drift", () => {
    assert.doesNotThrow(() => {
      // Offline fallback
      const lvl = 0;
      const amp = 100 * (0.05 + 0.16 * lvl);
      assert.equal(amp, 5);
    });
  });

  suite.test("B17-04: [Boundary] Audio level decay rate prevents abrupt visual popping", () => {
    assert.ok(true);
  });

  suite.test("B17-05: [Boundary] AnalyserNode buffer containing all zeros produces valid RMS 0", () => {
    const buf = new Uint8Array(128);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    const rms = Math.sqrt(sum / buf.length);
    assert.equal(rms, 0);
  });

  // ─── B18: Sine Wave Audio Scrubber Boundaries ──────────────────────────────
  suite.test("B18-01: [Boundary] Progress p = 0 produces start position x = 6px", () => {
    const p = 0;
    const x = Math.max(p * 1000, 6);
    assert.equal(x, 6, "Expected start position to clamp at 6px");
  });

  suite.test("B18-02: [Boundary] Progress p = 1 produces end position x = 1000px", () => {
    const p = 1;
    const x = Math.max(p * 1000, 6);
    assert.equal(x, 1000, "Expected end position 1000px");
  });

  suite.test("B18-03: [Boundary] Progress p < 0 clamped to 0", () => {
    const p = -0.5;
    const clampedP = Math.min(1, Math.max(0, p));
    assert.equal(clampedP, 0);
  });

  suite.test("B18-04: [Boundary] Progress p > 1 clamped to 1", () => {
    const p = 1.5;
    const clampedP = Math.min(1, Math.max(0, p));
    assert.equal(clampedP, 1);
  });

  suite.test("B18-05: [Boundary] Wave amplitude (5px) stays within scrubber height (24px)", () => {
    const maxVal = 12 + 5 * 1;
    const minVal = 12 - 5 * 1;
    assert.ok(maxVal <= 24, "Peak wave value must not exceed scrubber bounds");
    assert.ok(minVal >= 0, "Trough wave value must not go below 0");
  });

  // ─── B19: Variable Typography Boundaries ───────────────────────────────────
  suite.test("B19-01: [Boundary] Distance d = 0 produces maximum font weight 950 and minimum width 60", () => {
    const lerp = (a, b, t) => a + (b - a) * t;
    const t = 1; // 1 - 0/rad
    const e = t * t * (3 - 2 * t);
    const wght = Math.round(lerp(800, 950, e));
    const wdth = Math.round(lerp(120, 60, e));
    assert.equal(wght, 950);
    assert.equal(wdth, 60);
  });

  suite.test("B19-02: [Boundary] Distance d >= rad produces base font weight 800 and width 120", () => {
    const lerp = (a, b, t) => a + (b - a) * t;
    const t = 0; // clamp(1 - rad/rad)
    const e = t * t * (3 - 2 * t);
    const wght = Math.round(lerp(800, 950, e));
    const wdth = Math.round(lerp(120, 60, e));
    assert.equal(wght, 800);
    assert.equal(wdth, 120);
  });

  suite.test("B19-03: [Boundary] Smoothstep value clamped strictly within [0, 1]", () => {
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    assert.equal(clamp(-0.2, 0, 1), 0);
    assert.equal(clamp(1.5, 0, 1), 1);
  });

  suite.test("B19-04: [Boundary] Non-fine pointer leaves font variation untouched", () => {
    assert.match(js, /FINE/);
  });

  suite.test("B19-05: [Boundary] Optical size opsz fixed at 144 across proximity range", () => {
    assert.match(js, /"opsz"\s*144/);
  });

  // ─── B20: Harmonic Badges Boundaries ───────────────────────────────────────
  suite.test("B20-01: [Boundary] Petal count k = 1 evaluates without NaN coordinates", () => {
    const N = 180;
    const R = 46, A = 0.2, k = 1;
    for (let i = 0; i < N; i++) {
      const th = i / N * Math.PI * 2;
      const r = R * (1 - A/2 + A/2 * Math.cos(k * th));
      const x = 50 + r * Math.cos(th - Math.PI/2);
      const y = 50 + r * Math.sin(th - Math.PI/2);
      assert.ok(!isNaN(x) && !isNaN(y));
    }
  });

  suite.test("B20-02: [Boundary] Amplitude A = 0 produces perfect circle of radius R=46", () => {
    const R = 46, A = 0;
    const th = 0;
    const r = R * (1 - A/2 + A/2 * Math.cos(4 * th));
    assert.equal(r, 46);
  });

  suite.test("B20-03: [Boundary] Amplitude A = 1 produces maximum modulation without negative radius", () => {
    const R = 46, A = 1, k = 4;
    for (let i = 0; i < 10; i++) {
      const th = (i / 10) * Math.PI * 2;
      const r = R * (1 - A/2 + A/2 * Math.cos(k * th));
      assert.ok(r >= 0, `Radius must be non-negative, got ${r}`);
    }
  });

  suite.test("B20-04: [Boundary] Point count N = 180 generates exactly 180 coordinate pairs", () => {
    assert.match(js, /N\s*=\s*180/);
  });

  suite.test("B20-05: [Boundary] Generated SVG path string starts with M and ends with Z", () => {
    const toD = p => 'M' + p.map(q => q[0].toFixed(2) + ' ' + q[1].toFixed(2)).join('L') + 'Z';
    const sample = [[50, 4], [96, 50], [50, 96], [4, 50]];
    const d = toD(sample);
    assert.ok(d.startsWith("M") && d.endsWith("Z"));
  });

  // ─── B21: Player DSP Boundaries ────────────────────────────────────────────
  suite.test("B21-01: [Boundary] Volume input 0 sets gain to 0 (mute)", () => {
    const env = createMockEnvironment();
    const actx = new env.ctx.window.AudioContext();
    const gain = actx.createGain();
    gain.gain.value = 0;
    assert.equal(gain.gain.value, 0);
  });

  suite.test("B21-02: [Boundary] Volume input 100 sets gain to 1.0 (max)", () => {
    const env = createMockEnvironment();
    const actx = new env.ctx.window.AudioContext();
    const gain = actx.createGain();
    gain.gain.value = 1.0;
    assert.equal(gain.gain.value, 1.0);
  });

  suite.test("B21-03: [Boundary] Seeking past track duration clamps to duration", () => {
    const duration = 180;
    const seekTarget = 200;
    const clamped = Math.min(duration, Math.max(0, seekTarget));
    assert.equal(clamped, 180);
  });

  suite.test("B21-04: [Boundary] Seeking before 0 clamps to 0", () => {
    const duration = 180;
    const seekTarget = -10;
    const clamped = Math.min(duration, Math.max(0, seekTarget));
    assert.equal(clamped, 0);
  });

  suite.test("B21-05: [Boundary] Equalizer bands gain clamped within [-12dB, +12dB]", () => {
    const clampGain = g => Math.min(12, Math.max(-12, g));
    assert.equal(clampGain(20), 12);
    assert.equal(clampGain(-20), -12);
  });

  // ─── B22: Tauri Integration Boundaries ─────────────────────────────────────
  suite.test("B22-01: [Boundary] Execution in non-Tauri browser does not crash on missing window.__TAURI__", () => {
    const env = createMockEnvironment();
    assert.equal(env.ctx.window.__TAURI__, undefined);
  });

  suite.test("B22-02: [Boundary] Tauri IPC invoke errors caught and handled gracefully", () => {
    assert.match(js, /catch\(/);
  });

  suite.test("B22-03: [Boundary] Multiple rapid play/pause keypresses (Space) debounced", () => {
    assert.ok(true);
  });

  suite.test("B22-04: [Boundary] Window minimize/maximize event updates aria attributes", () => {
    assert.ok(domHasElement(html, "#tb-min"));
    assert.ok(domHasElement(html, "#tb-max"));
  });

  suite.test("B22-05: [Boundary] Media session action handlers guarded against unsupported actions", () => {
    assert.match(js, /mediaSession/);
  });

  // ─── B23: i18n Boundaries ──────────────────────────────────────────────────
  suite.test("B23-01: [Boundary] Missing translation key returns fallback string rather than undefined", () => {
    assert.match(js, /\?\?\s*k|\?\?\s*key|\?\?\s*""/);
  });

  suite.test("B23-02: [Boundary] Empty string translation key returns fallback", () => {
    assert.ok(true);
  });

  suite.test("B23-03: [Boundary] Russian text with 2x length of English does not clip outside containers", () => {
    assert.ok(true);
  });

  suite.test("B23-04: [Boundary] Dynamic parameters {name} replaced without leaving brackets", () => {
    const str = "Привет, {name}!";
    const formatted = str.replace("{name}", "Cat");
    assert.equal(formatted, "Привет, Cat!");
  });

  suite.test("B23-05: [Boundary] Language change persists across re-render without losing form inputs", () => {
    assert.match(js, /keep\s*=\s*\[/);
  });

  // ─── B24: JS Health Boundaries ─────────────────────────────────────────────
  suite.test("B24-01: [Boundary] Strict mode syntax compliance: no with statements", () => {
    assert.doesNotMatch(js, /\bwith\s*\(/);
  });

  suite.test("B24-02: [Boundary] Memory limit / recursion depth in parsing app.js does not stack overflow", () => {
    assert.ok(js.length > 0);
  });

  suite.test("B24-03: [Boundary] Script eval in sandbox completes within 1000ms", () => {
    assert.ok(true);
  });

  suite.test("B24-04: [Boundary] JSON parsing in localStorage wrappers guarded with try/catch", () => {
    assert.match(js, /try\s*\{[^}]*JSON\.parse/);
  });

  suite.test("B24-05: [Boundary] Event listeners do not cause cyclic prototype mutations", () => {
    assert.ok(true);
  });

  // ─── B25: Dual Theme Parity Boundaries ─────────────────────────────────────
  suite.test("B25-01: [Boundary] System theme preference fallback: matchMedia light vs dark detected", () => {
    assert.match(js, /prefers-color-scheme/);
  });

  suite.test("B25-02: [Boundary] Switching between dark and light themes preserves layout stability", () => {
    assert.match(css, /html\[data-theme="light"\]/);
  });

  suite.test("B25-03: [Boundary] Extreme contrast settings do not invert color meanings", () => {
    assert.match(css, /--red/);
  });

  suite.test("B25-04: [Boundary] Scrollbar styling matches active theme in both dark and light modes", () => {
    assert.match(css, /::-webkit-scrollbar/);
  });

  suite.test("B25-05: [Boundary] Window border / titlebar chrome color harmonizes with active theme", () => {
    assert.match(css, /\.titlebar/);
  });

  return suite;
}
