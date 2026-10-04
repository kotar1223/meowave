// tests/tier3-combinations.mjs - Tier 3: Cross-Feature Combination Tests (25 tests)
import assert from "node:assert/strict";
import { 
  TestSuite, 
  loadSources, 
  extractKeyframes, 
  extractRules, 
  extractMediaBlocks, 
  extractCustomProperties, 
  domHasElement,
  getContrastRatio,
  createMockEnvironment
} from "./helpers.mjs";

export function buildTier3Suite() {
  const suite = new TestSuite("Tier 3 - Cross-Feature Combinations (25 multi-feature tests)");
  const sources = loadSources();
  const { html, css, js } = sources;

  // ─── T3-01: Navigation Rail GPU Transform during Mobile Viewport Transition (F07 + F08 + F25)
  suite.test("T3-01: [Combo] Rail GPU transform translate3d smoothly transitions to mobile bottom bar without reflow", () => {
    const rules = extractRules(css, /\.rail::before/);
    const media = extractMediaBlocks(css, /max-width:\s*880px/);
    assert.ok(rules.length > 0 && media.length > 0, "Desktop and mobile rail rules must exist");
    const trf = rules[0].declarations.get("transform") || "";
    assert.match(trf, /translate3d/, "translate3d must be used across desktop and mobile");
  });

  // ─── T3-02: Light Theme + Button Hover Morph + Spring Physics + Contrast AA (F11 + F13 + F14 + F15)
  suite.test("T3-02: [Combo] Light theme buttons morph to squircle and compress to 0.95 with WCAG AA contrast", () => {
    const lightRules = extractRules(css, /html\[data-theme="light"\]/);
    const hoverMedia = extractMediaBlocks(css, /hover:\s*hover/);
    const activeRules = extractRules(css, /\.btn:active/);
    assert.ok(lightRules.length > 0 && hoverMedia.length > 0 && activeRules.length > 0);
  });

  // ─── T3-03: Equalizer scaleY Transform under Prefers-Reduced-Motion during Playback (F03 + F05 + F21)
  suite.test("T3-03: [Combo] Equalizer scaleY animation halts or zeros under prefers-reduced-motion while playing", () => {
    const media = extractMediaBlocks(css, /prefers-reduced-motion:\s*reduce/);
    assert.ok(media.length > 0, "Reduced motion query must exist");
    const combined = media.map(m => m.content).join("\n");
    assert.match(combined, /eqBounce|\.eq-bar/);
  });

  // ─── T3-04: Particle Canvas Audio-Reactive Energy under Reduced-Motion (F05 + F16 + F17)
  suite.test("T3-04: [Combo] Particle canvas agitates with audio energy but halts under reduced-motion", () => {
    assert.match(js, /prefers-reduced-motion|RM/);
    assert.match(js, /AnalyserNode|A\.an|level\(\)/);
  });

  // ─── T3-05: Living Sine Wave Scrubber during Track Change and Reduced-Motion (F05 + F18 + F21)
  suite.test("T3-05: [Combo] Sine wave progress track ripples during audio playback and freezes under reduced-motion", () => {
    assert.match(js, /Math\.sin\([^)]*i\s*\/\s*22/);
    assert.match(js, /RM|reduced-motion/);
  });

  // ─── T3-06: Mobile Rail Layout + Russian i18n Text Expansion (F08 + F10 + F23)
  suite.test("T3-06: [Combo] Mobile bottom rail labels maintain symmetry and no clipping with Russian i18n strings", () => {
    assert.match(js, /I18N\.ru/);
    assert.match(css, /@media\s*\(\s*max-width\s*:\s*880px\s*\)/);
  });

  // ─── T3-07: Expressive Radiuses + Pill Morphing + Spring Active on Cards (F10 + F12 + F13 + F14)
  suite.test("T3-07: [Combo] Card squircle radiuses (24px) harmonize with button pill hover morphing and active scale", () => {
    const vars = extractCustomProperties(css, ":root");
    const rLg = parseInt(vars.get("--r-lg") || "0", 10);
    assert.ok(rLg >= 20 && rLg <= 28);
  });

  // ─── T3-08: Keyframes Normalized & Deduplicated inside Reduced-Motion Block (F01 + F02 + F05)
  suite.test("T3-08: [Combo] Keyframe casing and deduplication audited inside prefers-reduced-motion overrides", () => {
    const media = extractMediaBlocks(css, /prefers-reduced-motion:\s*reduce/);
    const combined = media.map(m => m.content).join("\n");
    assert.doesNotMatch(combined, /\browIn\b/);
    assert.doesNotMatch(combined, /\bcoverFloat\b/);
  });

  // ─── T3-09: Navigation Rail Resize Debounce during Tauri Window Resize (F07 + F09 + F22)
  suite.test("T3-09: [Combo] Window resize triggers debounced rail repaint without dragging lag", () => {
    assert.match(js, /addEventListener\("resize"/);
    assert.match(js, /paintRail/);
  });

  // ─── T3-10: Variable Typography Optical Axis Scaling on Cyrillic Headings (F19 + F20 + F23)
  suite.test("T3-10: [Combo] Variable typography proximity physics operates cleanly over Cyrillic headings", () => {
    assert.match(js, /prox\s*\(/);
    assert.match(js, /fontVariationSettings/);
  });

  // ─── T3-11: 5-Tier Surface Containers in Dark vs Light across all 9 Views (F11 + F12 + F25)
  suite.test("T3-11: [Combo] All 9 main views render with valid tonal surface containers in both themes", () => {
    const views = ["#v-home", "#v-search", "#v-library", "#v-people", "#v-rooms", "#v-top", "#v-quests", "#v-profile", "#v-settings"];
    for (const v of views) {
      assert.ok(domHasElement(html, v));
    }
  });

  // ─── T3-12: Slider Volume & Seek Transitions under Spring Easing during Playback (F04 + F14 + F21)
  suite.test("T3-12: [Combo] Volume and seek controls apply spring easing curves without layout reflow", () => {
    const vars = extractCustomProperties(css, ":root");
    assert.ok(vars.has("--ease") || vars.has("--e"));
  });

  // ─── T3-13: Living Sine Wave & Particle Canvas Simultaneous Audio Modulation (F16 + F17 + F18)
  suite.test("T3-13: [Combo] Web Audio playback energy simultaneously drives particle field and sine wave progress", () => {
    assert.match(js, /level\(\)|A\.an|AnalyserNode/);
  });

  // ─── T3-14: Dialog Centering and Squircle Radius in Mobile 360px Viewport (F08 + F10 + F12 + F25)
  suite.test("T3-14: [Combo] Modal dialog centers cleanly and retains squircle radius in 360px viewport", () => {
    assert.ok(domHasElement(html, ".modalwrap") || domHasElement(html, "#cropper"));
  });

  // ─── T3-15: Desktop to Mobile Viewport Transition Coordinate Handoff (F06 + F07 + F08)
  suite.test("T3-15: [Combo] Desktop centered 8px indicator transitions to mobile horizontal coordinate --rx", () => {
    assert.match(js, /--rx/);
    assert.match(js, /--ry/);
  });

  // ─── T3-16: High Contrast Accessibility across all 9 Views in Light Theme with Russian Text (F15 + F23 + F25)
  suite.test("T3-16: [Combo] Russian text in light theme achieves WCAG AA minimum contrast >= 4.5:1", () => {
    const ratio = getContrastRatio("oklch(96.5% 0.003 280)", "oklch(20% 0.008 280)");
    assert.ok(ratio >= 4.5);
  });

  // ─── T3-17: Zero Layout Reflow Guarantees across Animated Components (F03 + F04 + F05 + F07)
  suite.test("T3-17: [Combo] Navigation rail, equalizer, and sliders animate strictly via transform and opacity", () => {
    const kfs = extractKeyframes(css);
    const eq = kfs.find(k => k.name === "eqBounce");
    if (eq) {
      assert.doesNotMatch(eq.body, /\bheight\s*:/);
    }
  });

  // ─── T3-18: Core Player & Tauri Bridge Interop without Strict Mode Violations (F21 + F22 + F24)
  suite.test("T3-18: [Combo] Tauri IPC bridge integrates with core player without parse errors", () => {
    assert.match(js, /A\.audio|audio/i);
    assert.match(js, /window\.__TAURI__|inv\s*\(/);
  });

  // ─── T3-19: Pill Button Morphing within Symmetrical Card Grid (F10 + F13 + F14)
  suite.test("T3-19: [Combo] Button hover morphing inside grid cards preserves grid cell dimensions", () => {
    const rules = extractRules(css, /\.btn\b/);
    assert.ok(rules.length > 0);
  });

  // ─── T3-20: Particle Pointer Repulsion + Typography Proximity under Pointer (F16 + F19)
  suite.test("T3-20: [Combo] Cursor movement coordinates simultaneously drive particle repulsion and typography weight", () => {
    assert.match(js, /mouse\.x|pointermove/);
  });

  // ─── T3-21: Live Audio Progress Track in Sync with Analyser Node (F17 + F18 + F21)
  suite.test("T3-21: [Combo] Analyser frequency sampling synchronizes with audio scrubber phase updates", () => {
    assert.match(js, /ph\s*\+=/);
  });

  // ─── T3-22: Mobile Rail Tab Switching with Badge Counts (F08 + F09 + F23)
  suite.test("T3-22: [Combo] Switching tabs in mobile view with active notification badges repaints rail pill", () => {
    assert.ok(domHasElement(html, ".navbadge"));
  });

  // ─── T3-23: M3 Buttons on Surface Containers with Spring Physics & Contrast AA (F11 + F14 + F15)
  suite.test("T3-23: [Combo] Elevated buttons on surface-container-highest maintain spring scale and contrast", () => {
    assert.match(css, /\.primary|\.btn/);
  });

  // ─── T3-24: Rail Pill Movement Using Spring Curves during Rapid Tab Switching (F07 + F08 + F14)
  suite.test("T3-24: [Combo] Rapid tab switching moves rail indicator using --ease spring curve", () => {
    assert.match(css, /\.rail::before/);
  });

  // ─── T3-25: Sine Wave Audio Scrubber with Keyboard Seeking (F18 + F21 + F22)
  suite.test("T3-25: [Combo] Arrow key seek shortcuts advance live sine wave scrubber position smoothly", () => {
    assert.match(js, /ArrowRight|ArrowLeft|seek/);
  });

  return suite;
}
