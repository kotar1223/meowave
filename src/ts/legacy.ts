/* When the classic scripts have run.

   The TypeScript modules execute before the classic scripts: a module script
   is deferred, and Vite moves it into <head>, ahead of the deferred classic
   scripts at the end of <body>. Code that only defines things (naudio.ts)
   does not care. Code that needs app.js's globals at start-up waits for
   src/ready.js, the last classic script — the moment the old aura.js,
   update.js and covers.js ran at, still inside the same task, so no frame
   is drawn in between. */

declare global {
  interface Window {
    MW_LEGACY_READY?: boolean;
  }
}

/** An error in one module's start-up must not stop the others, and must
    still reach window.onerror like an uncaught one did. */
function report(e: unknown): void {
  if (typeof reportError === "function") reportError(e);
  else setTimeout(() => { throw e; });
}

export function afterLegacy(fn: () => void): void {
  const run = () => {
    try { fn(); } catch (e) { report(e); }
  };
  if (window.MW_LEGACY_READY) run();
  else addEventListener("mw:legacy", run, { once: true });
}
