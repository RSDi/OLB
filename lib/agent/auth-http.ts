// Shared 401 / service-role gates for /api/agent/*. NextResponse lives here
// so the hash check in ./keys.ts stays testable.

import { NextResponse } from "next/server";
import { agentAuthorized } from "./keys.ts";
import { listActiveAgentKeys } from "./keys-store.ts";
import { keyHasScope, type AgentScope } from "./scopes.ts";

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
    const hashes = loaded.filter((k) => keyHasScope(k.scopes, need)).map((k) => k.hash);
    if (!agentAuthorized(request.headers.get("authorization"), hashes)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  } catch (err) {
    console.error("[agent] key lookup", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't check the agent key." }, { status: 500 });
  }
  return null;
}
