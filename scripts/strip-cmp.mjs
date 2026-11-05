// Stack rewrite helper (HANDOFF.md, steps 2 and 3): is a module in src/ts/ the
// same code as the classic script it came from, once its types are gone?
//
//   node scripts/strip-cmp.mjs <new.ts> <old.js|-> <from> <to> <startMark> <endMark> [a=>>b …]
//
// <old.js> is read from line <from> up to <to> (0-based, as Array.slice;
// "-" reads it from stdin, e.g. `git show 030d9dc:src/messenger.js | node … -`);
// <new.ts> is stripped of types and cut from the first <startMark> up to the
// last <endMark>. Both sides drop comments and whitespace; `(x)=>` counts as
// `x=>`. Each `a=>>b` replaces a with b in the new side first — for the few
// places a type changes the code, e.g. "(e.target).closest=>>e.target.closest"
// for `(e.target as Element).closest`. Needs Node 22.13+ (stripTypeScriptTypes).
import { stripTypeScriptTypes } from "node:module";
import fs from "node:fs";

const [tsFile, oldSrc, from, to, startMark, endMark, ...subs] = process.argv.slice(2);
if (!endMark) {
  console.error("usage: node scripts/strip-cmp.mjs <new.ts> <old.js|-> <from> <to> <startMark> <endMark> [a=>>b …]");
  process.exit(2);
}
const js = stripTypeScriptTypes(fs.readFileSync(tsFile, "utf8"), { mode: "strip" });
const old = (oldSrc === "-" ? fs.readFileSync(0, "utf8") : fs.readFileSync(oldSrc, "utf8")).split("\n").slice(+from, +to).join("\n");
const a = js.slice(js.indexOf(startMark), js.lastIndexOf(endMark));
const norm = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n"'`]*\n/g, "\n").replace(/\s+/g, "").replace(/\((\w+)\)=>/g, "$1=>");
const x = norm(old);
let y = norm(a);
for (const s of subs) { const [p, q] = s.split("=>>"); y = y.split(p).join(q); }
let i = 0;
while (i < x.length && x[i] === y[i]) i++;
if (x === y) console.log("IDENTICAL after stripping types (" + x.length + " chars)");
else {
  console.log("old", x.length, "new", y.length, "first diff at", i);
  console.log("old:", x.slice(Math.max(0, i - 60), i + 80));
  console.log("new:", y.slice(Math.max(0, i - 60), i + 80));
  process.exit(1);
}
