/* The TypeScript side of the page — Vite builds this into dist/bundle/.

   Step 2 of the stack rewrite (HANDOFF.md): screens move here from the
   classic scripts one at a time. A module that only defines things runs
   right away; one that needs app.js's globals starts in afterLegacy(),
   right after the last classic script (src/ready.js). Order of the starts
   is the order the old scripts had on the page. */
import "./naudio";
import "./e2e";
import "./fx";
import { afterLegacy } from "./legacy";
import { initSearch } from "./search";
import { initChat } from "./chat";
import { initProfile } from "./profile";
import { initCustom } from "./custom";
import { initUpdate } from "./update";
import { initCovers } from "./covers";
import { initAura } from "./aura";

afterLegacy(initSearch);
afterLegacy(initChat);
afterLegacy(initProfile);
afterLegacy(initCustom);
afterLegacy(initUpdate);
afterLegacy(initCovers);
afterLegacy(initAura);
