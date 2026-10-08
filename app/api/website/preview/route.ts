import { draftMode } from "next/headers";
import { redirect } from "next/navigation";
import { requireWebsite } from "../../../../lib/auth/guards";
import { previewPath } from "../../../../lib/website/preview-path";

// Settings → Website → Preview: turns on Next's draft mode for this browser
// and opens the page, so the public site shows the unpublished drafts on top
// of what's live (lib/website/queries.ts). Only the Website grant; RLS keeps
// the drafts to them as well.
export async function GET(request: Request) {
  const gate = await requireWebsite();
  if ("error" in gate) return new Response(gate.error, { status: 403 });
  (await draftMode()).enable();
  redirect(previewPath(new URL(request.url).searchParams.get("path")));
}
