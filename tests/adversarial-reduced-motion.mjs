// tests/adversarial-reduced-motion.mjs
// Adversarial Empirical Challenge Suite for Milestone M1
// Agent: teamwork_preview_challenger_m1_2

import fs from "node:fs";
import path from "node:path";
import assert from "node:assert";

const root = path.resolve(import.meta.dirname, "..");
const css = fs.readFileSync(path.join(root, "src", "app.css"), "utf8");
const js = fs.readFileSync(path.join(root, "src", "app.js"), "utf8");

console.log("=================================================================");
console.log("   ADVERSARIAL STRESS-TEST: PREFERS-REDUCED-MOTION & TIMING     ");
console.log("=================================================================\n");

let passed = 0;
let failed = 0;

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`\x1b[32m✔ PASS\x1b[0m: ${name}`);
    passed++;
  } catch (err) {
    console.log(`\x1b[31m✖ FAIL\x1b[0m: ${name}`);
    console.log(`  \x1b[33mError: ${err.message}\x1b[0m`);
    failed++;
  }
}

async function main() {
  // ─── CHALLENGE 1: 1000 FPS Infinite Animation Strobe & Reset Verification ─────
  await runTest("Challenge 1.1: Universal reset sets animation-iteration-count: 1 !important (no 1000fps loop)", () => {
    const rmMatch = css.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([^}]+(?:\{[^}]+\}[^}]*)*)\}/);
    assert.ok(rmMatch, "Must contain @media (prefers-reduced-motion: reduce)");
    assert.match(css, /\*,\s*\*::before,\s*\*::after\s*\{[^}]*animation-iteration-count:\s*1\s*!important/s,
      "Universal reset must explicitly enforce animation-iteration-count: 1 !important to prevent 1000fps infinite loops");
  });

  await runTest("Challenge 1.2: Ambient & infinite animations have animation: none !important", () => {
    const requiredSuppressed = [
      ".friend-listening-chip .eq-bar",
      ".fp[data-bg-mode=\"dynamic\"] .fp-bg",
      ".auth-orb-1",
      ".auth-orb-2",
      ".status-indicator.listening",
      ".dots3 i",
      ".splash-ring"
    ];
    for (const sel of requiredSuppressed) {
      const escaped = sel.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
      const rx = new RegExp(escaped + "[^{]*\\{[^}]*animation:\\s*none\\s*!important", "s");
      assert.match(css, rx, `Selector ${sel} must be explicitly suppressed with animation: none !important`);
    }
  });

  // ─── CHALLENGE 2: Rail & Seg Indicator Transition Suppression ─────────────────
  await runTest("Challenge 2.1: .rail::before and .seg::before have transition: none !important", () => {
    assert.match(css, /\.rail::before\s*,\s*\.seg::before\s*\{[^}]*transition:\s*none\s*!important/s,
      ".rail::before and .seg::before must have transition: none !important in reduced motion block");
  });

  await runTest("Challenge 2.2: Evaluate F05-04 test condition in tests/tier1-features.mjs", async () => {
    const { extractMediaBlocks, extractRules } = await import("./helpers.mjs");
    const media = extractMediaBlocks(css, /prefers-reduced-motion:\s*reduce/);
    const combined = media.map(m => m.content).join("\n");
    const railRules = extractRules(combined, /\.rail::before/);
    assert.ok(railRules.length > 0, "prefers-reduced-motion must include .rail::before");
    const tr = railRules[0].declarations.get("transition") || railRules[0].declarations.get("transition-duration");
    console.log(`    [Observation] Parsed transition declaration on .rail::before: '${tr}'`);
    console.log(`    [Observation] Does 'tr === "none"' match? ${tr === "none"}`);
    console.log(`    [Observation] Does 'tr.includes("0s")' match? ${tr.includes("0s")}`);
    console.log(`    [Observation] Does 'tr.startsWith("none")' match? ${tr.startsWith("none")}`);
    
    // Notice that tier1-features.mjs line 208 is:
    // assert.ok(tr === "none" || tr === "0s" || tr === "0ms" || tr.includes("0s"))
    const e2eConditionPassed = (tr === "none" || tr === "0s" || tr === "0ms" || tr.includes("0s"));
    console.log(`    [Observation] Result of tier1-features.mjs line 208 condition: ${e2eConditionPassed}`);
    assert.ok(tr.startsWith("none"), "Expected transition to begin with 'none'");
  });

  // ─── CHALLENGE 3: Search Reveal & Particle rAF Loop Behavior Under Reduced Motion 
  await runTest("Challenge 3.1: Search reveal animation terminates rAF loop on BOOT.reduce", () => {
    assert.match(js, /function stopFlowAnimation\(\)\s*\{[^}]*cancelAnimationFrame\(rafId\)/s,
      "stopFlowAnimation must cancel rAF loop");
    assert.match(js, /motionMedia\.addEventListener\("change",\s*e\s*=>\s*\{[^}]*stopFlowAnimation\(\)/s,
      "matchMedia change listener must invoke stopFlowAnimation on reduced motion");
  });

  await runTest("Challenge 3.2: Particle canvas loop behavior and audio clock integrity simulation", () => {
    // Simulate the exact code from src/app.js lines 1162-1185
    function simulatePlayback(isReduced, durationMs = 5000, frameStepMs = 16.66) {
      let now = 0;
      let last = 0;
      let lastFrame = 0;
      let pos = 0;
      const effectiveBudget = isReduced ? 100 : 0;
      let frameCalls = 0;
      let advanceClockCalls = 0;

      // Simulate browser rAF ticking
      while (now <= durationMs) {
        frameCalls++;
        if (effectiveBudget > 0 && (now - lastFrame) < effectiveBudget) {
          // throttled early return
          now += frameStepMs;
          continue;
        }
        lastFrame = now;
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        // non-local advanceClock
        pos += dt;
        advanceClockCalls++;
        now += frameStepMs;
      }

      return { pos, frameCalls, advanceClockCalls };
    }

    const normalRun = simulatePlayback(false, 5000, 16.66);
    const reducedRun = simulatePlayback(true, 5000, 16.66);

    console.log(`    [Simulation 5.0s playback]:`);
    console.log(`      Normal motion (reduce=false): pos = ${normalRun.pos.toFixed(3)}s (Expected ~5.0s, delta = ${(normalRun.pos - 5.0).toFixed(3)}s)`);
    console.log(`      Reduced motion (reduce=true): pos = ${reducedRun.pos.toFixed(3)}s (Expected ~5.0s, delta = ${(reducedRun.pos - 5.0).toFixed(3)}s)`);

    const driftRatio = reducedRun.pos / normalRun.pos;
    console.log(`      Playback speed under reduced motion: ${(driftRatio * 100).toFixed(1)}% of normal!`);

    // Assert that audio clock does NOT drift by more than 5%
    assert.ok(Math.abs(driftRatio - 1.0) < 0.05, 
      `CRITICAL BUG: Audio clock runs at ${(driftRatio * 100).toFixed(1)}% speed under reduced motion due to effectiveBudget=100 and Math.min(0.05, dt)!`);
  });

  console.log("\n-----------------------------------------------------------------");
  console.log(`SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log("-----------------------------------------------------------------\n");

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
