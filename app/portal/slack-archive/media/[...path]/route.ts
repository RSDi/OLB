// Serves a full-size archived attachment by redirecting to a freshly signed
// Storage URL. The photo album's viewer loads originals (and downloads) this
// way instead of embedding signed URLs in the page: a URL minted per request
// can't have expired by the time someone opens a photo, however long the
// album has been left open — and the album page doesn't have to sign two
// URLs for every photo up front.
//
// Signing uses the admin client (the bucket has no read policies; see
// migration 0077), so this route is the one place archive access isn't
// enforced by row-level security for free — it checks it itself. Every
// stored path starts with its Slack channel ID (`<channel>/<ts>/<file>`,
// thumbnails under `thumbs/<same path>.webp`), and the file is served only
// if the viewer can see that channel: the lookup goes through the viewer's
// own session, so migration 0084's RLS decides — a private channel's
// photos stay with that channel's members.

import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "../../../../../lib/auth/viewer";
import { createClient } from "../../../../../lib/supabase/server";
import { createAdminClient } from "../../../../../lib/supabase/admin";
import { signArchiveFileUrl } from "../../../../../lib/slack-archive/files";
import { THUMBNAIL_PREFIX } from "../../../../../lib/slack-archive/album";
import { canViewArchive } from "../../../../../lib/slack-archive/data";

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
  // 404 rather than 403 throughout, so the route doesn't confirm which
  // files (or private channels) exist.
  if (!canViewArchive(viewer)) return notFound();

  const { path } = await params;
  const segments = path.map(decodeSegment);
  // Reject empty/dot segments so a path can't name one channel up front
  // while resolving somewhere else.
  if (segments.length === 0 || segments.some((s) => s === "" || s === "." || s === ".." || s.includes("/"))) {
    return notFound();
  }
  const storagePath = segments.join("/");

  const channelPath = storagePath.startsWith(THUMBNAIL_PREFIX) ? storagePath.slice(THUMBNAIL_PREFIX.length) : storagePath;
  const channelId = channelPath.split("/")[0];
  if (!channelId) return notFound();
  const supabase = await createClient();
  const { data: visible } = await supabase
    .from("slack_archive_channels")
    .select("id")
    .eq("slack_channel_id", channelId)
    .maybeSingle();
  if (!visible) return notFound();

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
