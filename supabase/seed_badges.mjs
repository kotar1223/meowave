// Syncs the badge catalog in Supabase with src/assets/badges/badges.json, and
// mints promo codes.
//
// badges.json is the single source of truth for the art and the thresholds, so
// the database has to follow it rather than the other way round. Editing SQL by
// hand for every new badge is how the two drift apart.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node supabase/seed_badges.mjs
//
// Options:
//   --dry            show what would change, write nothing
//   --prune          delete catalog rows that badges.json no longer lists
//   --code ID=CODE   mint a promo code for badge ID (repeatable)
//   --max-uses N     use limit for codes minted in this run (default: unlimited)
//   --expires DATE   expiry for codes minted in this run (ISO date)
//   --note TEXT      maintainer note stored with the code
//
// Example — 500 early-bird codes that expire at the end of the year:
//   node supabase/seed_badges.mjs --code early_bird=MEOW-EARLY-2026 \
//        --max-uses 500 --expires 2026-12-31 --note "pre-release"
//
// The service role key bypasses RLS, which is exactly why this runs from your
// machine and never ships inside the app.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const CATALOG = join(here, "..", "src", "assets", "badges", "badges.json");

const URL_ = process.env.SUPABASE_URL?.replace(/\/+$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f) => {
  const i = args.indexOf(f);
  return i >= 0 ? args[i + 1] : undefined;
};
const many = (f) =>
  args.reduce((acc, a, i) => (a === f && args[i + 1] ? [...acc, args[i + 1]] : acc), []);

const DRY = has("--dry");
const PRUNE = has("--prune");

if (!URL_ || !KEY) {
  console.error(
    "Missing credentials.\n" +
      "  SUPABASE_URL=https://xxxx.supabase.co \\\n" +
      "  SUPABASE_SERVICE_ROLE_KEY=eyJ... \\\n" +
      "  node supabase/seed_badges.mjs\n\n" +
      "Both are in Supabase → Project Settings → API. Use the service_role key,\n" +
      "not the anon key: the catalog is not writable from the client by design.",
  );
  process.exit(1);
}

/** Minimal REST client. Avoids a dependency for what is four requests. */
async function rest(path, { method = "GET", body, prefer } = {}) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 400)}`);
  }
  return text ? JSON.parse(text) : null;
}

/** Same hash the database uses, so codes minted here validate there. */
const hashCode = (raw) => createHash("sha256").update(raw.trim().toUpperCase()).digest("hex");

/** badges.json rule -> the catalog's (metric, threshold, compare) triple. */
function ruleOf(entry) {
  const rule = entry.rule ?? {};
  if (rule.gte !== undefined) return { metric: rule.metric, threshold: rule.gte, compare: "gte" };
  if (rule.lte !== undefined) return { metric: rule.metric, threshold: rule.lte, compare: "lte" };
  // Code badges and hand-granted badges have no threshold to check.
  return { metric: null, threshold: null, compare: "gte" };
}

/// Status badges are granted by a maintainer only: no code, no threshold. Their
/// ids are fixed here rather than inferred, because getting this wrong would
/// mean minting a redeemable code for Owner.
const STATUS_IDS = new Set(["owner", "admin", "developer", "moderator", "tester"]);

function loadCatalog() {
  const json = JSON.parse(readFileSync(CATALOG, "utf8"));
  const rows = [];

  // v2 catalog: one flat `badges` array with an `unlock` field.
  // v1 catalog: separate `achievements` / `codes` arrays. Both are accepted so
  // an older checkout still seeds.
  if (Array.isArray(json.badges)) {
    for (const b of json.badges) {
      const source = STATUS_IDS.has(b.id)
        ? "status"
        : b.unlock === "achievement"
          ? "achievement"
          : "code";
      rows.push({
        id: b.id,
        source,
        rarity: b.rarity ?? "common",
        ...(source === "achievement"
          ? ruleOf(b)
          : { metric: null, threshold: null, compare: "gte" }),
      });
    }
  } else {
    for (const a of json.achievements ?? []) {
      rows.push({ id: a.id, source: "achievement", rarity: a.rarity ?? "common", ...ruleOf(a) });
    }
    for (const c of json.codes ?? []) {
      rows.push({
        id: c.id,
        source: "code",
        rarity: c.rarity ?? "common",
        metric: null,
        threshold: null,
        compare: "gte",
      });
    }
  }

  const seen = new Set();
  for (const r of rows) {
    if (seen.has(r.id)) throw new Error(`duplicate badge id in badges.json: ${r.id}`);
    seen.add(r.id);
    if (r.source === "achievement" && r.metric && r.threshold === null) {
      throw new Error(`${r.id}: metric "${r.metric}" without a gte/lte threshold`);
    }
  }
  return rows;
}

function diff(local, remote) {
  const byId = new Map(remote.map((r) => [r.id, r]));
  const added = [];
  const changed = [];
  for (const l of local) {
    const r = byId.get(l.id);
    if (!r) {
      added.push(l);
      continue;
    }
    const fields = ["source", "rarity", "metric", "threshold", "compare"];
    const delta = fields.filter((f) => String(r[f] ?? "") !== String(l[f] ?? ""));
    if (delta.length) changed.push({ ...l, delta, was: r });
  }
  const localIds = new Set(local.map((l) => l.id));
  const orphaned = remote.filter((r) => !localIds.has(r.id));
  return { added, changed, orphaned };
}

async function mintCodes(catalogIds) {
  const specs = many("--code");
  if (!specs.length) return;

  const maxUses = val("--max-uses") ? Number(val("--max-uses")) : null;
  const expires = val("--expires") ?? null;
  const note = val("--note") ?? null;

  if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1)) {
    throw new Error("--max-uses must be a positive integer");
  }
  if (expires && Number.isNaN(Date.parse(expires))) {
    throw new Error(`--expires is not a date: ${expires}`);
  }

  const rows = specs.map((spec) => {
    const at = spec.indexOf("=");
    if (at < 1) throw new Error(`--code expects ID=CODE, got: ${spec}`);
    const badge_id = spec.slice(0, at).trim();
    const raw = spec.slice(at + 1).trim();
    if (!raw) throw new Error(`empty code for ${badge_id}`);
    if (!catalogIds.has(badge_id)) {
      throw new Error(`unknown badge id "${badge_id}" — add it to badges.json first`);
    }
    // A leaked Owner code cannot be taken back, so there is deliberately no way
    // to mint one. Use --grant for those.
    if (STATUS_IDS.has(badge_id)) {
      throw new Error(
        `"${badge_id}" is a status badge and has no code by design.\n` +
          `  Grant it directly:  node supabase/seed_badges.mjs --grant ${badge_id}=<user-uuid>`,
      );
    }
    return {
      badge_id,
      raw,
      row: {
        code_hash: hashCode(raw),
        badge_id,
        max_uses: maxUses,
        expires_at: expires ? new Date(expires).toISOString() : null,
        note,
      },
    };
  });

  console.log(`\nPromo codes (${rows.length}):`);
  for (const r of rows) {
    console.log(
      `  ${r.badge_id} <- ${r.raw}   ${maxUses ? `${maxUses} uses` : "unlimited"}` +
        `${expires ? `, expires ${expires}` : ""}`,
    );
  }

  if (DRY) {
    console.log("  (dry run, nothing written)");
    return;
  }

  await rest("badge_codes?on_conflict=code_hash", {
    method: "POST",
    body: rows.map((r) => r.row),
    prefer: "resolution=merge-duplicates,return=minimal",
  });
  console.log("  stored (hashed — the plaintext above is the only copy, save it now)");
}

/// Hands a badge to a specific account. This is the only path to the status
/// badges (Owner, Admin, Developer, Moderator, Tester), and it needs the
/// service role key — there is no client-callable equivalent.
async function grantBadges(catalogIds) {
  const specs = many("--grant");
  if (!specs.length) return;

  const rows = specs.map((spec) => {
    const at = spec.indexOf("=");
    if (at < 1) throw new Error(`--grant expects BADGE=USER_UUID, got: ${spec}`);
    const badge_id = spec.slice(0, at).trim();
    const user_id = spec.slice(at + 1).trim();
    if (!catalogIds.has(badge_id)) throw new Error(`unknown badge id "${badge_id}"`);
    if (!/^[0-9a-f-]{36}$/i.test(user_id)) {
      throw new Error(`"${user_id}" is not a user uuid (find it in Auth → Users)`);
    }
    return { user_id, badge_id };
  });

  console.log(`\nDirect grants (${rows.length}):`);
  for (const r of rows) console.log(`  ${r.badge_id} -> ${r.user_id}`);
  if (DRY) {
    console.log("  (dry run, nothing written)");
    return;
  }
  await rest("user_badges?on_conflict=user_id,badge_id", {
    method: "POST",
    body: rows,
    prefer: "resolution=merge-duplicates,return=minimal",
  });
  console.log("  granted");
}

async function main() {
  const local = loadCatalog();
  console.log(`badges.json: ${local.length} badges`);

  const remote = await rest("badges?select=id,source,rarity,metric,threshold,compare");
  console.log(`database:    ${remote.length} badges`);

  const { added, changed, orphaned } = diff(local, remote);

  if (added.length) {
    console.log(`\nNew (${added.length}):`);
    for (const a of added) {
      console.log(`  + ${a.id} [${a.source}/${a.rarity}]${a.metric ? ` ${a.metric} ${a.compare} ${a.threshold}` : ""}`);
    }
  }
  if (changed.length) {
    console.log(`\nChanged (${changed.length}):`);
    for (const c of changed) {
      for (const f of c.delta) {
        console.log(`  ~ ${c.id}.${f}: ${c.was[f] ?? "null"} -> ${c[f] ?? "null"}`);
      }
    }
  }
  if (orphaned.length) {
    console.log(`\nIn database but not in badges.json (${orphaned.length}):`);
    for (const o of orphaned) console.log(`  ? ${o.id}`);
    if (!PRUNE) {
      console.log("  kept — pass --prune to delete them (this also deletes who earned them)");
    }
  }
  if (!added.length && !changed.length) console.log("\nCatalog already in sync.");

  if (!DRY && (added.length || changed.length)) {
    await rest("badges?on_conflict=id", {
      method: "POST",
      body: local,
      prefer: "resolution=merge-duplicates,return=minimal",
    });
    console.log(`\nUpserted ${local.length} rows.`);
  } else if (DRY) {
    console.log("\n(dry run, nothing written)");
  }

  if (PRUNE && orphaned.length && !DRY) {
    const ids = orphaned.map((o) => o.id).join(",");
    await rest(`badges?id=in.(${encodeURIComponent(ids)})`, {
      method: "DELETE",
      prefer: "return=minimal",
    });
    console.log(`Deleted ${orphaned.length} orphaned rows.`);
  }

  await mintCodes(new Set(local.map((l) => l.id)));
  await grantBadges(new Set(local.map((l) => l.id)));
  console.log("\nDone.");
}

main().catch((e) => {
  console.error(`\nFailed: ${e.message}`);
  process.exit(1);
});
