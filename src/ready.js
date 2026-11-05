/* ready.js — the last classic script on the page.
   The TypeScript modules (src/ts, built by Vite) run before the classic
   scripts; whatever in them needs app.js's globals waits for this event.
   See src/ts/legacy.ts. */
window.MW_LEGACY_READY=true;
dispatchEvent(new Event("mw:legacy"));
