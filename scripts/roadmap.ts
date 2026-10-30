/*
 * The Roadmap board (/portal/roadmap) from the command line, through the
 * Product Manager bot's API (/api/roadmap/items). This is how coding agents
 * keep the board in step with their work (the rule is in AGENTS.md).
 *
 * Usage:
 *   npm run roadmap -- list [<column>]
 *   npm run roadmap -- propose --area Portal --title "…" --description "…"
 *   npm run roadmap -- move <id> <column> [--note "…"] [--preview <url>]
 *   npm run roadmap -- note <id> "…"
 *
 * Columns: proposed, planned, progress, preview, released, parked. A card
 * can't go to preview without a preview link; released fills in today's
 * date. propose always lands on Proposed: only a super-admin's Approve moves
 * a card to Planned with their name on it.
 *
 * Needs OLB_ROADMAP_BOT_TOKEN in .env.local (the same value as the Vercel
 * project). Talks to the live site unless ROADMAP_URL says otherwise
 * (http://localhost:3000 for a dev server).
 */

import { parseArgs } from "node:util";
import { AREAS, STATUSES, isArea, isStatus } from "../lib/roadmap/model";

const BASE = (process.env.ROADMAP_URL || "https://omahalightningbasketball.com").replace(/\/+$/, "");
const TOKEN = process.env.OLB_ROADMAP_BOT_TOKEN;

const COLUMNS = STATUSES.map((s) => s.key).join(", ");

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function call(method: "GET" | "POST" | "PATCH", path: string, body?: unknown): Promise<Record<string, unknown>> {
  if (!TOKEN) fail("OLB_ROADMAP_BOT_TOKEN isn't set. Copy it from the Vercel project's environment variables into .env.local.");
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { authorization: `Bearer ${TOKEN}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) fail(`${method} ${path}: ${res.status} ${typeof json.error === "string" ? json.error : res.statusText}`);
  return json;
}

type Item = { id: string; title: string; area: string; status: string; approved_by_name?: string | null };

function show(item: Item) {
  const approved = item.approved_by_name ? `  (approved by ${item.approved_by_name})` : "";
  console.log(`${item.id}  ${item.status.padEnd(9)}  ${item.area.padEnd(13)}  ${item.title}${approved}`);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { values, positionals } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: {
      area: { type: "string" },
      title: { type: "string" },
      description: { type: "string" },
      note: { type: "string" },
      preview: { type: "string" },
    },
  });

  switch (command) {
    case "list": {
      const column = positionals[0];
      if (column && !isStatus(column)) fail(`Pick a column: ${COLUMNS}.`);
      const { items } = (await call("GET", `/api/roadmap/items${column ? `?status=${column}` : ""}`)) as { items: Item[] };
      if (!items.length) console.log("No cards.");
      items.forEach(show);
      return;
    }
    case "propose": {
      const area = values.area ?? "";
      if (!isArea(area)) fail(`--area must be one of: ${AREAS.join(", ")}.`);
      if (!values.title?.trim()) fail("--title is required.");
      const { item } = (await call("POST", "/api/roadmap/items", {
        title: values.title,
        description: values.description ?? "",
        area,
      })) as { item: Item };
      show(item);
      return;
    }
    case "move": {
      const [id, column] = positionals;
      if (!id || !column) fail("Usage: npm run roadmap -- move <id> <column> [--note \"…\"] [--preview <url>]");
      if (!isStatus(column)) fail(`Pick a column: ${COLUMNS}.`);
      const { item } = (await call("PATCH", `/api/roadmap/items/${id}`, {
        status: column,
        ...(values.preview ? { preview_url: values.preview } : {}),
        ...(values.note ? { note: values.note } : {}),
      })) as { item: Item };
      console.log(`${item.id} → ${item.status}`);
      return;
    }
    case "note": {
      const [id, ...words] = positionals;
      const note = words.join(" ").trim();
      if (!id || !note) fail("Usage: npm run roadmap -- note <id> \"…\"");
      await call("PATCH", `/api/roadmap/items/${id}`, { note });
      console.log(`${id}: note added`);
      return;
    }
    default:
      fail(
        "Usage: npm run roadmap -- list [<column>] | propose --area <area> --title \"…\" --description \"…\" | move <id> <column> [--note \"…\"] [--preview <url>] | note <id> \"…\""
      );
  }
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
