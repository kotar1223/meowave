---
name: meowave-ui-verify
description: Use after any change to src/index.html, src/app.css, src/app.js, src/fx.js or src/discover.js that affects what the user sees — verifies the UI with real screenshots in headless Chromium plus the static e2e suite.
---

# Verifying Meowave UI changes

The frontend has no build step, so the files in `src/` can be served and screenshotted as they are. The Tauri backend is absent in a plain browser (`TAURI` is false), so inject data instead of calling Rust.

## 1. Static checks (always)
```
node --check src/app.js && node --check src/fx.js && node --check src/discover.js
node tests/run-e2e.mjs
```
Invariants the tests enforce (see `brain/Architecture.md`): `#fp`, `#fpbg`, `#fpc` and every `#v-*` view exist; `.view[data-active="true"]`; a `@media (max-width:700px)` block; the first `html[data-theme="light"]` rule is the token block; the first `prefers-reduced-motion` block stays first; unique `@keyframes` names with no width/height/top/left/margin/padding inside; an even number of backticks in `app.js`.

## 2. Screenshots
- Serve: `cd src && python3 -m http.server 8777`.
- Playwright with the system Chromium; seed `localStorage.meowave = {"ob":true,"lang":"ru"}` so onboarding is skipped; wait ~2.5 s for the splash to finish.
- Globals are reachable from `page.evaluate` (classic scripts): `go(view)`, `xlistSet(key,title,tracks)`, `setTrack`, `openFP()`, `MWDISC.{hsSet,shelvesHTML,dcRender,DC,HS}`, `MWFX.wall.*`.
- Put test images in `src/_t/` (never committed) and reference them as `http://localhost:8777/_t/…`.
- Sizes: 1280×800, 860×700 (narrow desktop), 390×844 (phone). Check the light theme (`theme:"light"` in the seeded state) when colours change.
- Look at every screenshot. Clipped popovers, wrapped rows inside column flexboxes and invisible text on the light theme are the usual failures.

## 3. Report
Write what was verified and at which sizes into `brain/Log/Worklog.md`.
