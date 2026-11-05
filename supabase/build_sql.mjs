// Builds ONE plain .sql file you can paste into the Supabase SQL editor.
//
// supabase/schema.sql uses psql's \ir include directive, which only psql
// understands — pasting it into the dashboard fails, and installing psql just
// to run a migration is a silly requirement. This inlines every migration in
// order and strips the psql-only lines.
//
//   node supabase/build_sql.mjs
//   -> supabase/FULL_SCHEMA.sql   (open it, copy all, paste, Run)
//
// Round 9 ("FULL_SCHEMA does not apply"): the SQL editor runs a paste as one
// transaction, so a single failing statement — a permission the project does
// not grant, an object left over from another version, a row that breaks a
// new constraint — rolled back all 3 800 lines, and the only trace was one
// line of red text at the bottom of the editor. Now every statement runs in
// its own savepoint: a failure is recorded and the rest still applies, and
// the last statement prints a table — one green row when everything went
// through, otherwise one row per failed statement with the file, the line,
// the start of the statement and the database's own error text.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const entry = readFileSync(join(here, "schema.sql"), "utf8");

// Bumped whenever a migration is added or changed in a way the client relies
// on. The app compares it with public.meowave_schema_version() after sign-in.
export const SCHEMA_VERSION = 18;

// Order comes from schema.sql itself, so this cannot drift out of sync.
const files = [...entry.matchAll(/^\\ir\s+(\S+)/gm)].map((m) => m[1]);
if (!files.length) throw new Error("no \\ir includes found in schema.sql");

const bodies = files.map((f) => [
  f,
  readFileSync(join(here, f), "utf8")
    // \echo is a psql client command and is a syntax error server-side.
    .split("\n")
    .filter((l) => !/^\s*\\/.test(l))
    .join("\n"),
]);

// ── statement splitter ─────────────────────────────────────────────────────
// Splits on top-level semicolons. Knows about the four places a semicolon is
// not a terminator: -- and /* */ comments (nested, as in Postgres), '…' and
// E'…' strings, "…" identifiers, and $tag$…$tag$ bodies ($1 is a parameter,
// not a quote). Returns [{sql, line}] with the 1-based starting line.
export function splitSql(src) {
  const out = [];
  let i = 0, start = 0, line = 1, startLine = 1, sawCode = false;
  const n = src.length;
  const push = (end) => {
    const sql = src.slice(start, end).trim();
    if (sawCode && sql) out.push({ sql, line: startLine });
    sawCode = false;
  };
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === "\n") { line++; i++; continue; }
    if (c === "-" && d === "-") { while (i < n && src[i] !== "\n") i++; continue; }
    if (c === "/" && d === "*") {
      let depth = 1; i += 2;
      while (i < n && depth) {
        if (src[i] === "\n") line++;
        if (src[i] === "/" && src[i + 1] === "*") { depth++; i += 2; continue; }
        if (src[i] === "*" && src[i + 1] === "/") { depth--; i += 2; continue; }
        i++;
      }
      continue;
    }
    if (!sawCode && !/\s/.test(c)) { sawCode = true; startLine = line; start = i; }
    if (c === "'") {
      const esc = i > 0 && /[eE]/.test(src[i - 1]) && !/[A-Za-z0-9_]/.test(src[i - 2] || "");
      i++;
      while (i < n) {
        if (src[i] === "\n") line++;
        if (esc && src[i] === "\\") { i += 2; continue; }
        if (src[i] === "'") { if (src[i + 1] === "'") { i += 2; continue; } i++; break; }
        i++;
      }
      continue;
    }
    if (c === '"') {
      i++;
      while (i < n) { if (src[i] === '"') { if (src[i + 1] === '"') { i += 2; continue; } i++; break; } if (src[i] === "\n") line++; i++; }
      continue;
    }
    if (c === "$") {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(src.slice(i, i + 64));
      if (m && !/[A-Za-z0-9_]/.test(src[i - 1] || "")) {
        const tag = m[0];
        const endAt = src.indexOf(tag, i + tag.length);
        if (endAt < 0) throw new Error(`unterminated ${tag} starting at line ${line}`);
        for (let k = i; k < endAt + tag.length; k++) if (src[k] === "\n") line++;
        i = endAt + tag.length;
        continue;
      }
    }
    if (c === ";") { push(i); i++; start = i; continue; }
    i++;
  }
  push(n);
  return out;
}

// A dollar-quote tag that does not occur inside the statement.
function tagFor(sql, base) {
  let t = `$${base}$`, k = 0;
  while (sql.includes(t)) t = `$${base}${++k}$`;
  return t;
}
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

// One statement in its own savepoint. A failure is written to the report and
// the paste carries on.
function guarded(sql, file, line) {
  const q = tagFor(sql, "q"), b = tagFor(sql, "b");
  return `do ${b}declare s text:=${q}${sql}${q};begin execute s;` +
    `exception when others then perform pg_temp.mw_fail(${lit(file)},${line},s,sqlstate,sqlerrm);end${b};`;
}

// ── preflight ──────────────────────────────────────────────────────────────
// CREATE OR REPLACE cannot change a function's row type, argument names or
// defaults (42P13), nor drop or rename a view column. A database that already
// holds an older variant — from the public repo, an earlier round or a snippet
// run by hand — fails on that one statement. Dropping every function and view
// the migrations below define makes each run behave like a fresh install:
// they are recreated and their grants/revokes replayed in order. Anything a
// policy, trigger or other view depends on cannot be dropped and is kept; it
// is replaced in place further down. No table, row or policy is touched here.
const fnNames = new Set();
const viewNames = new Set();
for (const [, body] of bodies) {
  for (const m of body.matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.([a-z0-9_]+)\s*\(/gi)) fnNames.add(m[1].toLowerCase());
  for (const m of body.matchAll(/create\s+(?:or\s+replace\s+)?view\s+public\.([a-z0-9_]+)/gi)) viewNames.add(m[1].toLowerCase());
}
fnNames.add("meowave_schema_version");
const arr = (set) => `array[${[...set].sort().map((x) => `'${x}'`).join(", ")}]::text[]`;
const preflight = [
  `do $preflight$`,
  `declare`,
  `  r record;`,
  `begin`,
  `  for r in`,
  `    select c.oid::regclass as obj from pg_class c join pg_namespace n on n.oid = c.relnamespace`,
  `     where n.nspname = 'public' and c.relkind = 'v' and c.relname = any (${arr(viewNames)})`,
  `  loop`,
  `    begin`,
  `      execute format('drop view %s', r.obj);`,
  `    exception when dependent_objects_still_exist or insufficient_privilege then null;`,
  `    end;`,
  `  end loop;`,
  `  for r in`,
  `    select p.oid::regprocedure as obj from pg_proc p join pg_namespace n on n.oid = p.pronamespace`,
  `     where n.nspname = 'public' and p.prokind = 'f' and p.proname = any (${arr(fnNames)})`,
  `  loop`,
  `    begin`,
  `      execute format('drop function %s', r.obj);`,
  `    exception when dependent_objects_still_exist or insufficient_privilege then null;`,
  `    end;`,
  `  end loop;`,
  `end`,
  `$preflight$`,
].join("\n");

const out = [
  "-- Meowave — full schema, generated by supabase/build_sql.mjs. Do not edit by hand:",
  "-- change supabase/migrations/*.sql and run `node supabase/build_sql.mjs`.",
  "--",
  "-- Supabase → SQL Editor → New query → paste the whole file → Run.",
  "-- If the editor warns about destructive operations, confirm: the drops only",
  "-- replace functions, views, policies and triggers that are created again",
  "-- right below; no table and no row is deleted.",
  "--",
  "-- Every statement runs on its own: one that fails no longer cancels the",
  "-- rest. The result at the bottom is a table — a single green row when",
  "-- everything applied, otherwise one row per statement that failed, with",
  "-- the file, the line and the error. Safe to run again at any time.",
  "--",
  "-- Вставьте весь файл в Supabase → SQL Editor → Run. Внизу будет таблица:",
  "-- одна зелёная строка — схема применена целиком; иначе по строке на каждую",
  "-- ошибку (файл, строка, текст) — пришлите её разработчику.",
  "",
  "create temp table if not exists mw_report (",
  "  n serial, file text, line int, stmt text, code text, error text);",
  "truncate pg_temp.mw_report;",
  "create or replace function pg_temp.mw_fail(f text, l int, s text, c text, e text)",
  "returns void language sql as $f$",
  "  insert into pg_temp.mw_report (file, line, stmt, code, error)",
  "  values (f, l, left(regexp_replace(s, '\\s+', ' ', 'g'), 140), c, e) $f$;",
  "",
  "-- ======================================================",
  "-- preflight: drop what the migrations recreate",
  "-- ======================================================",
  guarded(preflight, "preflight", 1),
  "",
];

let count = 0;
for (const [f, body] of bodies) {
  out.push(`-- ======================================================`);
  out.push(`-- ${f}`);
  out.push(`-- ======================================================`);
  for (const st of splitSql(body)) {
    count++;
    out.push(guarded(st.sql, f, st.line));
  }
}

const versionFn = `create or replace function public.meowave_schema_version()
returns int language sql immutable as $v$ select ${SCHEMA_VERSION} $v$`;
count++;
out.push(
  "-- ======================================================",
  "-- schema version (the app checks it after sign-in)",
  "-- ======================================================",
  guarded(versionFn, "version", 1),
  guarded("grant execute on function public.meowave_schema_version() to anon, authenticated", "version", 2),
  "",
  "-- ======================================================",
  "-- result",
  "-- ======================================================",
  `select status, file, line, statement, error from (`,
  `  select 0 as n,`,
  `         case when exists (select 1 from pg_temp.mw_report)`,
  `              then '⚠️ Applied except ' || (select count(*) from pg_temp.mw_report) || ' statement(s) below / Применено, кроме строк ниже'`,
  `              else '✅ Meowave schema v${SCHEMA_VERSION} applied completely / Схема применена полностью' end as status,`,
  `         null::text as file, null::int as line, null::text as statement, null::text as error`,
  `  union all`,
  `  select n, '❌ ' || code, file, line, stmt, error from pg_temp.mw_report`,
  `) r order by n;`,
  "",
);

const sql = out.join("\n");
const target = join(here, "FULL_SCHEMA.sql");
writeFileSync(target, sql);

console.log(`Wrote ${target}`);
console.log(`${files.length} migrations, ${count} statements, ${(sql.length / 1024).toFixed(0)} KB`);
console.log("\nNext:");
console.log("  1. Open the file and copy everything");
console.log("  2. Supabase dashboard -> SQL Editor -> New query");
console.log("  3. Paste, press Run — the result table says what applied");
