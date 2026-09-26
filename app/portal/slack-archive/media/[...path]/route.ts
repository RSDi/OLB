// Serves a full-size archived attachment by redirecting to a freshly signed
// Storage URL. The photo album's viewer loads originals (and downloads) this
// way instead of embedding signed URLs in the page: a URL minted per request
// can't have expired by the time someone opens a photo, however long the
// album has been left open — and the album page doesn't have to sign two
// URLs for every photo up front. Super-admin only, like the rest of the
// archive (the bucket itself has no read policies; see migration 0077).

import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "../../../../../lib/auth/viewer";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import { signArchiveFileUrl } from "../../../../../lib/slack-archive/files";

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const viewer = await getViewer();
  // 404 rather than 403, so the route doesn't confirm which files exist.
  if (!viewer?.isSuperAdmin) return new NextResponse("Not found", { status: 404 });

  const { path } = await params;
  const storagePath = path.map(decodeSegment).join("/");
  if (!storagePath) return new NextResponse("Not found", { status: 404 });

  const download = request.nextUrl.searchParams.get("download")?.trim() || undefined;
  const signedUrl = await signArchiveFileUrl(createAdminClient(), storagePath, { download });
  if (!signedUrl) return new NextResponse("Not found", { status: 404 });

  // Cached privately for a few minutes — well inside the signed URL's
  // one-hour life — so flipping back and forth in the viewer reuses the
  // same redirect instead of signing the same file again on every view.
  return NextResponse.redirect(signedUrl, {
    status: 302,
    headers: { "Cache-Control": "private, max-age=600" },
  });
}
