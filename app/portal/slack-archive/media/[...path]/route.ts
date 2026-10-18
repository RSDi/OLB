import { NextResponse, type NextRequest } from "next/server";
import { slackMediaHref } from "../../../../../lib/slack-archive/paths";

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const storagePath = path.map(decodeSegment).join("/");
  const download = request.nextUrl.searchParams.get("download") ?? undefined;
  const dest = slackMediaHref(storagePath, { download });
  return NextResponse.redirect(new URL(dest, request.url), 302);
}
