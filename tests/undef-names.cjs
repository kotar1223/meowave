// tests/undef-names.cjs — finds names the frontend reads but never defines.
//
// The app is a set of classic <script>s sharing one global scope, with no
// build step and no linter, so a call left behind after its function was
// removed (setTimeout(renderYmAcc,900) did exactly that) is a ReferenceError
// that only fires at runtime — and at top level it stops the rest of the
// file from running. This walks every script with a small scope resolver and
// prints the names that resolve to nothing: not a declaration in any
// enclosing scope, not a top-level declaration of any script, not a
// window.X = … assignment, not an implicit global. `typeof X` reads are
// guards and are ignored.
//
// Run with `node --expose-internals tests/undef-names.cjs <file>...`: the
// parser is the acorn that Node itself bundles, so the check has no
// dependencies. Prints JSON {unresolved:{name:[where,…]}, declared:[name,…]}
// or {skip:reason}. TypeScript modules (src/ts) are not parsed here: tsc
// checks them, and tier1 F27 counts their window.X = … as declarations.
"use strict";
let acorn;
try { acorn = require("internal/deps/acorn/acorn/dist/acorn"); }
catch (e) { console.log(JSON.stringify({ skip: "node's bundled acorn is unavailable: " + e.message })); process.exit(0); }
const fs = require("node:fs");
const path = require("node:path");

const files = process.argv.slice(2);
const GLOBAL = { parent: null, names: new Set(), fn: true };
const assigned = new Set();
const unresolved = new Map();
const WINDOWISH = new Set(["window", "globalThis", "self", "root", "top", "parent"]);

function parse(src, file) {
  const opts = { ecmaVersion: "latest", locations: true, allowHashBang: true, allowReturnOutsideFunction: true };
  try { return acorn.parse(src, { ...opts, sourceType: "script" }); }
  catch (_) { return acorn.parse(src, { ...opts, sourceType: "module" }); }
}

function patternNames(p, out) {
  if (!p) return out;
  switch (p.type) {
    case "Identifier": out.push(p.name); break;
    case "ObjectPattern": for (const q of p.properties) patternNames(q.type === "RestElement" ? q.argument : q.value, out); break;
    case "ArrayPattern": for (const q of p.elements) patternNames(q, out); break;
    case "AssignmentPattern": patternNames(p.left, out); break;
    case "RestElement": patternNames(p.argument, out); break;
  }
  return out;
}

/* var + function declarations of a function body (not of nested functions) */
function hoistVars(node, names) {
  if (!node || typeof node.type !== "string") return;
  switch (node.type) {
    case "FunctionDeclaration": if (node.id) names.add(node.id.name); return;
    case "FunctionExpression": case "ArrowFunctionExpression": case "ClassDeclaration": case "ClassExpression": return;
    case "VariableDeclaration": if (node.kind === "var") for (const d of node.declarations) patternNames(d.id, []).forEach(n => names.add(n)); break;
  }
  for (const k in node) {
    if (k === "loc" || k === "start" || k === "end") continue;
    const v = node[k];
    if (Array.isArray(v)) v.forEach(c => c && typeof c.type === "string" && hoistVars(c, names));
    else if (v && typeof v.type === "string") hoistVars(v, names);
  }
}

/* let/const/class/function declared directly in a block's statement list */
function blockDecls(body, names) {
  for (const s of body) {
    if (!s) continue;
    if (s.type === "VariableDeclaration" && s.kind !== "var") for (const d of s.declarations) patternNames(d.id, []).forEach(n => names.add(n));
    else if (s.type === "ClassDeclaration" && s.id) names.add(s.id.name);
    else if (s.type === "FunctionDeclaration" && s.id) names.add(s.id.name);
  }
}

function resolves(name, sc) { for (; sc; sc = sc.parent) if (sc.names.has(name)) return true; return false; }

let FILE = "";
function miss(name, node) {
  const where = `${FILE}:${node.loc.start.line}`;
  if (!unresolved.has(name)) unresolved.set(name, []);
  const arr = unresolved.get(name); if (arr.length < 5) arr.push(where);
}

function ref(id, sc) { if (!resolves(id.name, sc)) miss(id.name, id); }

function assignTarget(t, sc) {
  if (!t) return;
  if (t.type === "Identifier") { if (!resolves(t.name, sc)) assigned.add(t.name); return; }
  if (t.type === "MemberExpression") {
    // window.X = … / globalThis["X"] = … defines a global
    if (t.object.type === "Identifier" && WINDOWISH.has(t.object.name)) {
      if (!t.computed && t.property.type === "Identifier") assigned.add(t.property.name);
      else if (t.computed && t.property.type === "Literal" && typeof t.property.value === "string") assigned.add(t.property.value);
    }
    visit(t, sc); return;
  }
  if (t.type === "ObjectPattern") { for (const p of t.properties) { if (p.type === "RestElement") assignTarget(p.argument, sc); else { if (p.computed) visit(p.key, sc); assignTarget(p.value, sc); } } return; }
  if (t.type === "ArrayPattern") { for (const e of t.elements) assignTarget(e, sc); return; }
  if (t.type === "AssignmentPattern") { assignTarget(t.left, sc); visit(t.right, sc); return; }
  if (t.type === "RestElement") { assignTarget(t.argument, sc); return; }
  visit(t, sc);
}

/* references inside a binding pattern: defaults and computed keys */
function patternRefs(p, sc) {
  if (!p) return;
  switch (p.type) {
    case "ObjectPattern": for (const q of p.properties) { if (q.type === "RestElement") patternRefs(q.argument, sc); else { if (q.computed) visit(q.key, sc); patternRefs(q.value, sc); } } break;
    case "ArrayPattern": for (const q of p.elements) patternRefs(q, sc); break;
    case "AssignmentPattern": patternRefs(p.left, sc); visit(p.right, sc); break;
    case "RestElement": patternRefs(p.argument, sc); break;
  }
}

function fnScope(node, sc) {
  const s = { parent: sc, names: new Set(), fn: true };
  if (node.type === "FunctionExpression" && node.id) s.names.add(node.id.name);
  for (const p of node.params) patternNames(p, []).forEach(n => s.names.add(n));
  if (node.type !== "ArrowFunctionExpression") s.names.add("arguments");
  if (node.body.type === "BlockStatement") { hoistVars(node.body, s.names); blockDecls(node.body.body, s.names); }
  for (const p of node.params) patternRefs(p, s);
  if (node.body.type === "BlockStatement") node.body.body.forEach(st => visit(st, s)); else visit(node.body, s);
}

function visit(node, sc) {
  if (!node || typeof node.type !== "string") return;
  switch (node.type) {
    case "Identifier": ref(node, sc); return;
    case "FunctionDeclaration": case "FunctionExpression": case "ArrowFunctionExpression": fnScope(node, sc); return;
    case "ClassDeclaration": case "ClassExpression": {
      const s = { parent: sc, names: new Set(node.id ? [node.id.name] : []) };
      if (node.superClass) visit(node.superClass, sc);
      for (const m of node.body.body) {
        if (m.computed) visit(m.key, s);
        if (m.type === "StaticBlock") { const b = { parent: s, names: new Set() }; hoistVars({ type: "BlockStatement", body: m.body }, b.names); blockDecls(m.body, b.names); m.body.forEach(x => visit(x, b)); }
        else if (m.value) visit(m.value, s);
      }
      return;
    }
    case "BlockStatement": case "StaticBlock": {
      const s = { parent: sc, names: new Set() }; blockDecls(node.body, s.names); node.body.forEach(x => visit(x, s)); return;
    }
    case "Program": node.body.forEach(x => visit(x, sc)); return;
    case "SwitchStatement": {
      visit(node.discriminant, sc);
      const s = { parent: sc, names: new Set() };
      for (const c of node.cases) blockDecls(c.consequent, s.names);
      for (const c of node.cases) { visit(c.test, s); c.consequent.forEach(x => visit(x, s)); }
      return;
    }
    case "ForStatement": case "ForInStatement": case "ForOfStatement": {
      const s = { parent: sc, names: new Set() };
      const init = node.type === "ForStatement" ? node.init : node.left;
      if (init && init.type === "VariableDeclaration" && init.kind !== "var") for (const d of init.declarations) patternNames(d.id, []).forEach(n => s.names.add(n));
      if (node.type === "ForStatement") { visit(node.init, s); visit(node.test, s); visit(node.update, s); }
      else { if (init.type === "VariableDeclaration") visit(init, s); else assignTarget(init, s); visit(node.right, s); }
      visit(node.body, s); return;
    }
    case "CatchClause": {
      const s = { parent: sc, names: new Set(patternNames(node.param, [])) };
      patternRefs(node.param, s); visit(node.body, s); return;
    }
    case "VariableDeclaration": for (const d of node.declarations) { patternRefs(d.id, sc); visit(d.init, sc); } return;
    case "MemberExpression": visit(node.object, sc); if (node.computed) visit(node.property, sc); return;
    case "Property": case "PropertyDefinition": case "MethodDefinition":
      if (node.computed) visit(node.key, sc); visit(node.value, sc); return;
    case "LabeledStatement": visit(node.body, sc); return;
    case "BreakStatement": case "ContinueStatement": case "MetaProperty": case "Literal": case "ThisExpression": case "Super": case "TemplateElement": case "PrivateIdentifier": return;
    case "UnaryExpression": if (node.operator === "typeof" && node.argument.type === "Identifier") return; visit(node.argument, sc); return;
    case "AssignmentExpression": assignTarget(node.left, sc); visit(node.right, sc); return;
    case "UpdateExpression": if (node.argument.type === "Identifier") { if (!resolves(node.argument.name, sc)) assigned.add(node.argument.name); return; } visit(node.argument, sc); return;
    case "CallExpression": {
      // Object.assign(window, {a, b, c: …}) exports a, b and c as globals
      const c = node.callee;
      if (c.type === "MemberExpression" && !c.computed && c.object.type === "Identifier" && c.object.name === "Object" && c.property.name === "assign"
        && node.arguments[0]?.type === "Identifier" && WINDOWISH.has(node.arguments[0].name))
        for (const a of node.arguments.slice(1)) if (a.type === "ObjectExpression")
          for (const p of a.properties) if (p.type === "Property" && !p.computed) assigned.add(p.key.type === "Identifier" ? p.key.name : String(p.key.value));
      break;
    }
    case "ImportExpression": visit(node.source, sc); return;
    case "ImportDeclaration": for (const s of node.specifiers) GLOBAL.names.add(s.local.name); return;
    case "ExportNamedDeclaration": case "ExportDefaultDeclaration": visit(node.declaration, sc); return;
  }
  for (const k in node) {
    if (k === "loc" || k === "start" || k === "end" || k === "type") continue;
    const v = node[k];
    if (Array.isArray(v)) v.forEach(c => visit(c, sc));
    else if (v && typeof v.type === "string") visit(v, sc);
  }
}

const asts = [];
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  let ast;
  try { ast = parse(src, f); } catch (e) { console.log(JSON.stringify({ error: `${path.basename(f)}: ${e.message}` })); process.exit(0); }
  hoistVars(ast, GLOBAL.names); blockDecls(ast.body, GLOBAL.names);
  asts.push([path.basename(f), ast]);
}
for (const [f, ast] of asts) { FILE = f; visit(ast, GLOBAL); }
const out = {};
for (const [n, w] of [...unresolved].sort()) if (!assigned.has(n)) out[n] = w;
// `declared`: every global the classic scripts define (top-level names and
// window.X = … assignments) — the TypeScript side's globals.d.ts is checked
// against it (tier1 F27-02).
console.log(JSON.stringify({ unresolved: out, declared: [...new Set([...GLOBAL.names, ...assigned])].sort() }));
