// Read-only External Contacts lookup for club agents. Needs an agent key
// with `contacts:read` (0163, "Read External Contacts"). GET only.

import { NextResponse } from "next/server";
import { agentDeny } from "../../../../lib/agent/auth-http";
import { parseContactsQuery } from "../../../../lib/agent/contacts";
import { findAgentContacts } from "../../../../lib/agent/contacts-load";
import { agentPayloadLeaks } from "../../../../lib/agent/film";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const denied = await agentDeny(request, { scope: "contacts:read" });
  if (denied) return denied;

  const query = parseContactsQuery(new URL(request.url).searchParams);
  if ("error" in query) return NextResponse.json({ error: query.error }, { status: 400 });

  try {
    const body = await findAgentContacts(query);
    const leaks = agentPayloadLeaks(body);
    if (leaks.length) {
      console.error("[agent/contacts] refused to return secret fields", leaks);
      return NextResponse.json({ error: "Couldn't look up contacts." }, { status: 500 });
    }
    return NextResponse.json(body);
  } catch (err) {
    console.error("[agent/contacts GET]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't look up contacts." }, { status: 500 });
  }
}
