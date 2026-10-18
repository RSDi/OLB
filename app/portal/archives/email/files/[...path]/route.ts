// Serves an archived email attachment by redirecting to a freshly signed
// Storage URL. The bucket has no read policies; this route checks staff
// (via RLS on the attachments table) then signs with the service role.

import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "../../../../../../lib/auth/viewer";
import { createClient } from "../../../../../../lib/supabase/server";
import { createAdminClient } from "../../../../../../lib/supabase/admin";
import { canViewEmailArchive } from "../../../../../../lib/email-archive/access";
import { lookupAttachmentPath } from "../../../../../../lib/email-archive/data";
import { signEmailFileUrl } from "../../../../../../lib/email-archive/files";

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const notFound = () => new NextResponse("Not found", { status: 404 });
  const viewer = await getViewer();
  if (!canViewEmailArchive(viewer)) return notFound();

  const { path } = await params;
  const segments = path.map(decodeSegment);
  if (segments.length === 0 || segments.some((s) => s === "" || s === "." || s === ".." || s.includes("/"))) {
    return notFound();
  }
  const storagePath = segments.join("/");
  const supabase = await createClient();
  const row = await lookupAttachmentPath(supabase, storagePath);
  if (!row) return notFound();

  const download = request.nextUrl.searchParams.get("download")?.trim() || row.filename;
  const signedUrl = await signEmailFileUrl(createAdminClient(), storagePath, { download });
  if (!signedUrl) return notFound();

  return NextResponse.redirect(signedUrl, {
    status: 302,
    headers: { "Cache-Control": "private, max-age=600" },
  });
}
