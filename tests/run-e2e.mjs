#!/usr/bin/env node
// tests/run-e2e.mjs - Master E2E Automated Test Runner for Meowave
//
// Usage:
//   node tests/run-e2e.mjs               # Run all tiers (Tiers 1-4, 290 tests)
//   node tests/run-e2e.mjs --tier=1      # Run Tier 1 only
//   node tests/run-e2e.mjs --tier=2      # Run Tier 2 only
//   node tests/run-e2e.mjs --tier=3      # Run Tier 3 only
//   node tests/run-e2e.mjs --tier=4      # Run Tier 4 only
//   node tests/run-e2e.mjs --verbose     # Print each test with timing
//   node tests/run-e2e.mjs --json        # Output JSON report

import process from "node:process";
import { buildTier1Suite } from "./tier1-features.mjs";
import { buildTier2Suite } from "./tier2-boundaries.mjs";
import { buildTier3Suite } from "./tier3-combinations.mjs";
import { buildTier4Suite } from "./tier4-scenarios.mjs";

const args = process.argv.slice(2);
const isVerbose = args.includes("--verbose") || args.includes("-v");
const isJson = args.includes("--json");
const tierArg = args.find(a => a.startsWith("--tier="));
const selectedTier = tierArg ? parseInt(tierArg.split("=")[1], 10) : null;

async function main() {
  const startTime = performance.now();
  
  const suitesToRun = [];
  if (!selectedTier || selectedTier === 1) suitesToRun.push(buildTier1Suite());
  if (!selectedTier || selectedTier === 2) suitesToRun.push(buildTier2Suite());
  if (!selectedTier || selectedTier === 3) suitesToRun.push(buildTier3Suite());
  if (!selectedTier || selectedTier === 4) suitesToRun.push(buildTier4Suite());

  if (!isJson) {
    console.log("\n\x1b[1m\x1b[36m========================================================================\x1b[0m");
    console.log("\x1b[1m\x1b[36m       MEOWAVE E2E 4-TIER AUTOMATED TEST SUITE (Tiers 1-4)              \x1b[0m");
    console.log("\x1b[1m\x1b[36m========================================================================\x1b[0m");
    console.log(`\x1b[90mTimestamp: ${new Date().toISOString()}\x1b[0m`);
    console.log(`\x1b[90mTarget:    src/index.html, src/app.css, src/app.js\x1b[0m\n`);
  }

  const tierReports = [];
  let totalPassed = 0;
  let totalFailed = 0;
  let totalTests = 0;
  const allFailures = [];

  for (const suite of suitesToRun) {
    if (!isJson) {
      console.log(`\x1b[1m▶ Running ${suite.name}...\x1b[0m`);
    }
    const report = await suite.run(isVerbose);
    tierReports.push(report);
    totalPassed += report.passed;
    totalFailed += report.failed;
    totalTests += report.total;

    for (const res of report.results) {
      if (!res.ok) {
        allFailures.push({ tier: suite.name, title: res.title, error: res.error });
      }
    }

    if (!isJson) {
      const passColor = report.passed === report.total ? "\x1b[32m" : "\x1b[33m";
      console.log(`  └─ Result: ${passColor}${report.passed}/${report.total} passed\x1b[0m (${report.failed} failed)\n`);
    }
  }

  const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);

  if (isJson) {
    const jsonOutput = {
      timestamp: new Date().toISOString(),
      durationSeconds: parseFloat(elapsed),
      totalTests,
      totalPassed,
      totalFailed,
      passRate: ((totalPassed / totalTests) * 100).toFixed(1) + "%",
      tiers: tierReports,
      failures: allFailures,
    };
    console.log(JSON.stringify(jsonOutput, null, 2));
    process.exit(totalFailed === 0 ? 0 : 1);
  }

  // Summary Table
  console.log("\x1b[1m\x1b[36m------------------------------------------------------------------------\x1b[0m");
  console.log("\x1b[1m                        SUMMARY SCORECARD                               \x1b[0m");
  console.log("\x1b[1m\x1b[36m------------------------------------------------------------------------\x1b[0m");
  for (const t of tierReports) {
    const pct = ((t.passed / t.total) * 100).toFixed(1);
    const badge = t.failed === 0 ? "\x1b[32m✔ PASS\x1b[0m" : "\x1b[31m✖ IN-DEV\x1b[0m";
    console.log(`  ${badge}  ${t.name.padEnd(54)} ${t.passed}/${t.total} (${pct}%)`);
  }
  console.log("\x1b[1m\x1b[36m------------------------------------------------------------------------\x1b[0m");
  const overallPct = ((totalPassed / totalTests) * 100).toFixed(1);
  console.log(`\x1b[1mTOTAL: ${totalPassed}/${totalTests} Passed (${overallPct}%) in ${elapsed}s\x1b[0m`);
  console.log("\x1b[1m\x1b[36m========================================================================\x1b[0m\n");

  if (allFailures.length > 0) {
    console.log(`\x1b[1m\x1b[33mDetected Defects / Pending Implementations (${allFailures.length} total):\x1b[0m`);
    allFailures.slice(0, 15).forEach((f, idx) => {
      console.log(`  ${idx + 1}. \x1b[31m${f.title}\x1b[0m`);
      console.log(`     \x1b[90m${f.error}\x1b[0m`);
    });
    if (allFailures.length > 15) {
      console.log(`  \x1b[90m... and ${allFailures.length - 15} more pending items.\x1b[0m`);
    }
    console.log(`\n\x1b[90mNote: These failures reflect pre-existing bugs in Meowave awaiting Milestones M1-M5.\x1b[0m\n`);
    process.exit(1);
  } else {
    console.log("\x1b[1m\x1b[32m✔ ALL 290 TEST CASES PASSED SUCCESSFULLY!\x1b[0m\n");
    process.exit(0);
  }
}

main().catch(err => {
  console.error("Test runner encountered fatal error:", err);
  process.exit(2);
});
