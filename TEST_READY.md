# Test Suite Readiness Notice (TEST_READY.md)

**Status**: READY FOR MILESTONE VERIFICATION  
**Date**: 2026-10-04  
**Author**: `test_writer_e2e` (E2E Test Suite Architect)  
**Target Root**: `C:\Users\prism\Desktop\meowave-main`  

---

## 1. Test Suite Activation Command

To execute the complete automated test suite:
```bash
node tests/run-e2e.mjs
```

To run individual tiers during milestone development:
```bash
node tests/run-e2e.mjs --tier=1    # Tier 1: 125 Feature Coverage Tests
node tests/run-e2e.mjs --tier=2    # Tier 2: 125 Boundary & Corner Tests
node tests/run-e2e.mjs --tier=3    # Tier 3: 25 Cross-Feature Combination Tests
node tests/run-e2e.mjs --tier=4    # Tier 4: 15 Real-World Application Scenarios
```

To obtain detailed per-test diagnostics:
```bash
node tests/run-e2e.mjs --verbose
```

To output machine-readable JSON:
```bash
node tests/run-e2e.mjs --json
```

---

## 2. Test Suite Composition & Coverage Breakdown

| Tier | Name | Target Scope | Test Count | Current Pass | Current Fail | Pass Rate |
|:---|:---|:---|:---|:---|:---|:---|
| **Tier 1** | **Feature Coverage** | 5 tests per feature for all 25 features | **125 tests** | 76 | 49 | 60.8% |
| **Tier 2** | **Boundary & Corner Cases** | 5 boundary tests per feature for all 25 features | **125 tests** | 104 | 21 | 83.2% |
| **Tier 3** | **Cross-Feature Combinations** | Multi-feature interactions | **25 tests** | 18 | 7 | 72.0% |
| **Tier 4** | **Real-World Scenarios** | End-to-end user journeys | **15 tests** | 14 | 1 | 93.3% |
| **Total** | **Master Test Suite** | **Comprehensive Full-App Verification** | **290 tests** | **212** | **78** | **73.1%** |

*Note: The test suite meets and exceeds all scope requirements (>=125 Tier 1, >=125 Tier 2, >=25 Tier 3, >=13 Tier 4, total >=288 test cases).*

---

## 3. Coverage Matrix Across All 25 Features

| Feature # | Feature Name | Milestone | Tier 1 Tests | Tier 2 Tests | Tier 3 Combos | Tier 4 Scenarios |
|:---|:---|:---|:---|:---|:---|:---|
| **F01** | Keyframe Casing Normalization (`rowin` / `rowIn`) | M1 | F01-01 .. 05 | B01-01 .. 05 | T3-08 | Scenario 08 |
| **F02** | Keyframe Deduplication (`coverfloat` / `coverFloat`) | M1 | F02-01 .. 05 | B02-01 .. 05 | T3-08 | Scenario 08 |
| **F03** | Equalizer Reflow Elimination (`scaleY` vs `height`) | M1 | F03-01 .. 05 | B03-01 .. 05 | T3-03, T3-17 | Scenario 03 |
| **F04** | Slider & Switch Reflow Elimination | M1 | F04-01 .. 05 | B04-01 .. 05 | T3-12, T3-17 | Scenario 03 |
| **F05** | Comprehensive Prefers-Reduced-Motion | M1 | F05-01 .. 05 | B05-01 .. 05 | T3-03, T3-04, T3-05 | Scenario 07 |
| **F06** | Navigation Rail Desktop Centering (8px offset) | M2 | F06-01 .. 05 | B06-01 .. 05 | T3-15 | Scenario 01, 02 |
| **F07** | Navigation Rail GPU Transform (`translate3d`) | M2 | F07-01 .. 05 | B07-01 .. 05 | T3-01, T3-09, T3-24 | Scenario 02 |
| **F08** | Mobile Rail Horizontal Smooth Sliding | M2 | F08-01 .. 05 | B08-01 .. 05 | T3-01, T3-06, T3-22 | Scenario 05 |
| **F09** | Resize Jitter Suppression | M2 | F09-01 .. 05 | B09-01 .. 05 | T3-09, T3-22 | Scenario 05 |
| **F10** | Layout Symmetry & Geometry Alignment | M2 | F10-01 .. 05 | B10-01 .. 05 | T3-06, T3-07, T3-14, T3-19 | Scenario 01, 08 |
| **F11** | M3 Expressive 5-Tier Surface Containers | M3 | F11-01 .. 05 | B11-01 .. 05 | T3-02, T3-11, T3-23 | Scenario 06 |
| **F12** | Expressive Container Radiuses (20px-28px) | M3 | F12-01 .. 05 | B12-01 .. 05 | T3-07, T3-11, T3-14 | Scenario 09 |
| **F13** | Pill Shape Dynamic Hover Morphing | M3 | F13-01 .. 05 | B13-01 .. 05 | T3-02, T3-07, T3-19 | Scenario 08 |
| **F14** | Spring Physics & Emphasized Easing (`scale(0.95)`) | M3 | F14-01 .. 05 | B14-01 .. 05 | T3-02, T3-12, T3-23, T3-24 | Scenario 08 |
| **F15** | Light Theme Contrast Correction (WCAG AA >4.5:1) | M3 | F15-01 .. 05 | B15-01 .. 05 | T3-02, T3-16, T3-23 | Scenario 06 |
| **F16** | Harmonic Vector Potential Particle Canvas | M4 | F16-01 .. 05 | B16-01 .. 05 | T3-04, T3-13, T3-20 | Scenario 01 |
| **F17** | Audio-Reactive Living Particle Waves | M4 | F17-01 .. 05 | B17-01 .. 05 | T3-04, T3-13, T3-21 | Scenario 03 |
| **F18** | Living Sine Wave Audio Progress Track | M4 | F18-01 .. 05 | B18-01 .. 05 | T3-05, T3-13, T3-21, T3-25 | Scenario 04 |
| **F19** | Responsive Variable Typography Physics | M4 | F19-01 .. 05 | B19-01 .. 05 | T3-10, T3-20 | Scenario 02 |
| **F20** | Harmonic Parametric SVG Geometry Badges | M4 | F20-01 .. 05 | B20-01 .. 05 | T3-10 | Scenario 08 |
| **F21** | Core Player & Local Playback Integrity | M5 | F21-01 .. 05 | B21-01 .. 05 | T3-03, T3-12, T3-18, T3-21 | Scenario 03, 14 |
| **F22** | Tauri API & Native Integration Integrity | M5 | F22-01 .. 05 | B22-01 .. 05 | T3-09, T3-18, T3-25 | Scenario 13 |
| **F23** | i18n Multi-language Integrity | M5 | F23-01 .. 05 | B23-01 .. 05 | T3-06, T3-10, T3-16, T3-22 | Scenario 11 |
| **F24** | JavaScript Syntax & Runtime Health | M5 | F24-01 .. 05 | B24-01 .. 05 | T3-18 | Scenario 01, 15 |
| **F25** | Dual Theme Parity & No-Overflow Verification | M5 | F25-01 .. 05 | B25-01 .. 05 | T3-01, T3-11, T3-14, T3-16 | Scenario 02, 05, 06 |

---

## 4. Defect Escalation for Milestone Agents

The 78 failing tests in the baseline run pinpoint the precise implementation tasks required across upcoming milestones:
1. **Milestone M1 (Worker)**:
   - Fix `rowIn` casing mismatches (lines 671, 774, 809, 1764 in `src/app.css`) to lowercase `rowin`.
   - Remove duplicate `@keyframes coverFloat` (line 1780) and harmonize with `coverfloat` (line 1052).
   - Convert `@keyframes eqBounce` (line 3503) from `height` reflow to `transform: scaleY()` with `transform-origin: bottom`.
   - Eliminate layout reflow transitions on `.seg::before`, `.sw::after`, `.fpseek .track`, and `.prog3 i`.
   - Expand `@media (prefers-reduced-motion: reduce)` to zero `eqBounce`, `fpBgBreath`, `floatOrb`, and `.rail::before` transitions.
2. **Milestone M2 (Worker)**:
   - Fix desktop `.rail::before` hardcoded `left: 9px` to mathematically exact centered 8px / dynamic `--rx`.
   - Migrate `.rail::before` transitions from `top`/`height` to GPU `transform: translate3d(var(--rx, 0px), var(--ry, 0px), 0)`.
   - Add horizontal transition for mobile rail indicator under `@media (max-width:880px)` and guard against collapsed bounds on Profile tab.
   - Suppress/debounce indicator transition during window resize in `src/app.js`.
3. **Milestone M3 (Worker)**:
   - Replace murky black drop shadows (`rgba(0,0,0,0.35-0.7)`) with 5-tier OKLCH tonal Surface Containers.
   - Upgrade card, panel, and modal border radii to M3 Expressive 20px-28px squircle geometry.
   - Implement pill button/chip hover morphing (`border-radius: 18px` on hover).
   - Implement spring physics (`transform: scale(0.95)` on `:active`) and cubic-bezier tokens (`--ease`, `--e-spring`).
   - Define `--md-sys-color-on-primary` to satisfy WCAG AA (>4.5:1) in light theme.
4. **Milestone M4 (Worker)**:
   - Implement 2D harmonic wave vector potential ($a = \sin(0.006y + 0.5T) + \cos(0.004x - 0.3T)$) and pointer repulsion on `#field`.
   - Connect Web Audio playback energy to particle speed and wave amplitude.
   - Implement dynamic living sine-wave audio progress runner ($y = 12 + 5\sin(i/22 - \text{ph})$).
   - Integrate variable typography proximity physics `prox()` for optical axes (`wght`, `wdth`, `opsz`).
   - Implement parametric geometric SVG path generator `pts(spec)` for badges.
5. **Milestone M5 (Worker)**:
   - Verify zero regressions on player playback, local HTTP streaming proxy, Tauri IPC calls, and i18n dictionaries.

The test suite is published and ready for immediate use.
