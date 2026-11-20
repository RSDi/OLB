// POST /api/film/staff-upload/complete — the staff uploader finished TUS.
// Same follow-up as /film/complete, gated on the signed-in user instead of
// the team-code cookie.

import { after, NextResponse } from "next/server";
import { getViewer } from "../../../../../lib/auth/viewer";
import { canUseStaffUploader } from "../../../../../lib/film/staff-upload";
import { getFilmUpload } from "../../../../../lib/film/uploads";
import type { UploadStatsInput } from "../../../../../lib/film/upload-stats";
import { kickFilmUploadComplete } from "../../../../../lib/film/upload-start";

export const maxDuration = 60;

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!canUseStaffUploader(viewer)) {
    return NextResponse.json({ error: "You can't upload film from here." }, { status: 403 });
  }
  let body: { uploadId?: unknown; stats?: UploadStatsInput };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send the upload id." }, { status: 400 });
  }
  const id = typeof body.uploadId === "string" ? body.uploadId : "";
  if (!id) return NextResponse.json({ error: "Send the upload id." }, { status: 400 });
  const row = await getFilmUpload(id);
  if (!row) return NextResponse.json({ error: "That upload wasn't found." }, { status: 404 });
  after(() => kickFilmUploadComplete(row, body.stats));
  return NextResponse.json({ ok: true, status: row.status });
}
