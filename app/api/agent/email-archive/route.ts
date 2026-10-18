// Import a Gmail thread into Archives → Email. Requires an agent key with
// the `email_archive:write` scope (0149). Read-only keys (0146) get 401.

import { NextResponse } from "next/server";
import { agentDeny } from "../../../../lib/agent/auth-http";
import { agentPayloadLeaks } from "../../../../lib/agent/film";
import { parseEmailArchiveImport } from "../../../../lib/email-archive/parse";
import { importEmailArchiveThread } from "../../../../lib/email-archive/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const denied = await agentDeny(request, { scope: "email_archive:write" });
  if (denied) return denied;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a JSON body." }, { status: 400 });
  }

  const parsed = parseEmailArchiveImport(json);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const result = await importEmailArchiveThread(parsed.value);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    const leaks = agentPayloadLeaks(result.body);
    if (leaks.length) {
      console.error("[agent/email-archive] refused to return secret fields", leaks);
      return NextResponse.json({ error: "Couldn't import the email." }, { status: 500 });
    }
    return NextResponse.json(result.body, { status: result.body.created ? 201 : 200 });
  } catch (err) {
    console.error("[agent/email-archive POST]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't import the email." }, { status: 500 });
  }
}
