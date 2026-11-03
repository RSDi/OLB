// Shared 401 / 403 / service-role gates for /api/agent/*. A wrong or revoked
// key is 401; a real key without the route's permission is 403. NextResponse lives here
// so the hash check in ./keys.ts stays testable.

import { NextResponse } from "next/server";
import { agentKeyAccess } from "./keys.ts";
import { listActiveAgentKeys } from "./keys-store.ts";
import type { AgentScope } from "./scopes.ts";

export async function agentDeny(
  request: Request,
  opts: { scope?: AgentScope } = {},
): Promise<NextResponse | null> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY not set; agent routes cannot look up keys." },
      { status: 500 },
    );
  }
  const need = opts.scope ?? "read";
  try {
    const loaded = await listActiveAgentKeys();
    if ("missingTable" in loaded) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const access = agentKeyAccess(request.headers.get("authorization"), loaded, need);
    if (access === "unauthorized") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (access === "forbidden") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  } catch (err) {
    console.error("[agent] key lookup", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't check the agent key." }, { status: 500 });
  }
  return null;
}
