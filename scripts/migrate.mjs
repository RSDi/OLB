#!/usr/bin/env node
// Migration runner.
//
// Reads supabase/migrations/*.sql in filename order, runs each file that
// hasn't been applied yet inside its own transaction, and records the
// applied filename + timestamp in a schema_migrations table.
//
// Usage:
//   DATABASE_URL='postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres' \
//   npm run db:migrate
//
//   # First-time setup against a database that already has historical
//   # migrations applied by hand: record every file up to (and including)
//   # the named one as applied, without running them. Subsequent regular
//   # 'npm run db:migrate' runs only apply what comes after.
//   npm run db:migrate -- --baseline-up-to 0131_club_finances.sql
//   (or Actions → Migrate → Run workflow with "Baseline up to" filled in)
//
// Find the connection string in your Supabase dashboard:
//   Connect → "Session pooler" (port 5432) — or the Direct connection from a
//   machine with IPv6. Never the Transaction pooler (port 6543).
//
//   # See what would run, change nothing:
//   npm run db:migrate -- --plan
//
// Two guards stop a run before anything is applied:
//   • Gaps: a pending file older than the newest recorded one usually means it
//     was applied by hand (SQL editor) and never recorded. Replaying it can
//     recreate dropped tables. Record it with
//     --baseline-up-to (after checking prod), or pass --allow-gaps.
//   • Destructive: a pending file marked "-- DESTRUCTIVE" or containing
//     `drop table` / `drop column` must run AFTER the deploy that stops using
//     what it drops (AGENTS.md "Ship it"). Pass --allow-destructive.
// .github/workflows/migrate.yml runs this on every push to main.
//
// The runner is idempotent: re-running is a no-op once everything is applied.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const HERE         = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS   = join(HERE, "..", "supabase", "migrations");
const TRACK_TABLE  = "schema_migrations";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error(
    "✗ DATABASE_URL is not set. Find it under " +
    "Supabase → Project Settings → Database → Connection string (URI).",
  );
  process.exit(1);
}

// Supavisor / pgBouncer transaction-mode poolers can occasionally drop pieces
// of compound multi-statement transactions (one observed case: a two-column
// UPDATE inside the same transaction as DDL silently skipped the second SET
// expression). Hard to reproduce, but the workaround is the direct endpoint,
// not the pooled one — so warn loudly if the URL is pointed at a pooler.
try {
  // The session pooler (port 5432) is fine — it's how GitHub's IPv4-only
  // runners reach Supabase. Transaction mode (port 6543) is the risky one.
  const u = new URL(DATABASE_URL);
  const host = u.host;
  if ((host.includes("pooler.supabase.com") && u.port === "6543") || host.includes("pgbouncer")) {
    console.warn(
      `⚠  DATABASE_URL points at a connection pooler (${host}).\n` +
      "   Migrations should use the Direct connection or the Session pooler (port 5432) instead.\n" +
      "   Supabase: Project Settings → Database → Connection string → URI.\n",
    );
  }
} catch { /* ignore — bad URL will fail on connect anyway */ }

const client = new pg.Client({ connectionString: DATABASE_URL });

async function ensureTrackingTable() {
  await client.query(`
    create table if not exists ${TRACK_TABLE} (
      filename   text primary key,
      applied_at timestamptz not null default now()
    )
  `);
  // public is exposed through the Supabase API: RLS with no policies plus no
  // grants keeps the table invisible to anon and signed-in users. The runner
  // connects as postgres, which bypasses both.
  await client.query(`alter table ${TRACK_TABLE} enable row level security`);
  await client.query(`revoke all on ${TRACK_TABLE} from anon, authenticated`);
}

async function listApplied() {
  const { rows } = await client.query(`select filename from ${TRACK_TABLE}`);
  return new Set(rows.map(r => r.filename));
}

function listOnDisk() {
  return readdirSync(MIGRATIONS)
    .filter(f => f.endsWith(".sql"))
    .sort();
}

async function applyOne(filename) {
  const sql = readFileSync(join(MIGRATIONS, filename), "utf8");
  process.stdout.write(`→ ${filename} ... `);
  try {
    await client.query("begin");
    await client.query(sql);
    await client.query(`insert into ${TRACK_TABLE} (filename) values ($1)`, [filename]);
    await client.query("commit");
    console.log("ok");
  } catch (err) {
    await client.query("rollback").catch(() => {});
    console.log("FAILED");
    throw err;
  }
}

/** Marked DESTRUCTIVE in its header, or drops a table or column (comments ignored). */
function isDestructive(filename) {
  const sql = readFileSync(join(MIGRATIONS, filename), "utf8");
  if (/^--\s*DESTRUCTIVE\b/m.test(sql)) return true;
  const code = sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "");
  return /\bdrop\s+table\b/i.test(code) || /\bdrop\s+column\b/i.test(code);
}

function parseArgs(argv) {
  const out = { baselineUpTo: null, plan: false, allowGaps: false, allowDestructive: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--plan") out.plan = true;
    if (argv[i] === "--allow-gaps") out.allowGaps = true;
    if (argv[i] === "--allow-destructive") out.allowDestructive = true;
    if (argv[i] === "--baseline-up-to") {
      out.baselineUpTo = argv[++i];
      if (!out.baselineUpTo) {
        console.error("✗ --baseline-up-to requires a filename argument.");
        process.exit(1);
      }
    }
  }
  return out;
}

async function baselineUpTo(filename) {
  const onDisk = listOnDisk();
  if (!onDisk.includes(filename)) {
    console.error(`✗ ${filename} not found in supabase/migrations/.`);
    process.exit(1);
  }
  const applied = await listApplied();
  const toMark  = onDisk.filter(f => f <= filename && !applied.has(f));
  if (toMark.length === 0) {
    console.log(`Nothing to baseline — everything up to ${filename} is already recorded.`);
    return;
  }
  console.log(`Baselining ${toMark.length} migration${toMark.length === 1 ? "" : "s"} as already-applied (no SQL will run):`);
  for (const f of toMark) {
    await client.query(`insert into ${TRACK_TABLE} (filename) values ($1) on conflict do nothing`, [f]);
    console.log(`  ✓ ${f}`);
  }
  console.log(`✓ Baseline complete. Run 'npm run db:migrate' to apply anything newer than ${filename}.`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await client.connect();
  try {
    await ensureTrackingTable();

    if (args.baselineUpTo) {
      await baselineUpTo(args.baselineUpTo);
      return;
    }

    const applied = await listApplied();
    const onDisk  = listOnDisk();
    const pending = onDisk.filter(f => !applied.has(f));

    if (pending.length === 0) {
      console.log(`Nothing to apply. ${applied.size} migrations already on ${hostOf(DATABASE_URL)}.`);
      return;
    }

    const newest = [...applied].sort().pop() ?? "";
    const gaps = pending.filter(f => f < newest);
    const destructive = pending.filter(isDestructive);
    console.log(`Pending on ${hostOf(DATABASE_URL)} (${pending.length}):`);
    for (const f of pending) {
      const tags = [gaps.includes(f) && "OLDER THAN NEWEST RECORDED", destructive.includes(f) && "DESTRUCTIVE"].filter(Boolean);
      console.log(`  ${f}${tags.length ? `   [${tags.join(", ")}]` : ""}`);
    }
    if (args.plan) { console.log("(--plan: nothing applied)"); return; }
    if (gaps.length && !args.allowGaps) {
      console.error(
        `\n✗ Stopped: ${gaps.length} pending file(s) are older than the newest recorded one (${newest}).\n` +
        "  They were most likely applied by hand and never recorded; replaying them can undo later changes.\n" +
        "  Check each against prod, then record them with --baseline-up-to <file> (or insert into schema_migrations),\n" +
        "  or re-run with --allow-gaps if they really still need to run. Nothing was applied.");
      process.exit(1);
    }
    if (destructive.length && !args.allowDestructive) {
      console.error(
        `\n✗ Stopped: ${destructive.join(", ")} drop${destructive.length === 1 ? "s" : ""} things.\n` +
        "  Destructive migrations run AFTER the deploy that stops using what they drop.\n" +
        "  Once that deploy is live, run again with --allow-destructive (GitHub: Actions → Migrate → Run workflow). Nothing was applied.");
      process.exit(1);
    }

    console.log(`Applying ${pending.length} migration${pending.length === 1 ? "" : "s"} to ${hostOf(DATABASE_URL)}:`);
    for (const f of pending) await applyOne(f);
    console.log(`✓ Done. ${pending.length} new, ${applied.size + pending.length} total.`);
  } finally {
    await client.end();
  }
}

function hostOf(url) {
  try { return new URL(url).host; } catch { return "(unknown host)"; }
}

main().catch(err => {
  console.error("\nMigration failed:", err.message || err);
  process.exit(1);
});
