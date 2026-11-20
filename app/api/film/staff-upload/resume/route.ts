// POST /api/film/staff-upload/resume — the staff uploader's version of
// /film/upload-token/resume: re-sign a token for an upload this browser
// already started so it sends only the rest. Gated on the signed-in user.

import { NextResponse } from "next/server";
import { getViewer } from "../../../../../lib/auth/viewer";
import { canUseStaffUploader } from "../../../../../lib/film/staff-upload";
import { getFilmUpload } from "../../../../../lib/film/uploads";
import { resumeFilmUpload } from "../../../../../lib/film/upload-start";

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!canUseStaffUploader(viewer)) {
    return NextResponse.json({ error: "You can't upload film from here." }, { status: 403 });
  }
  let body: { uploadId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send the upload id." }, { status: 400 });
  }
  const id = typeof body.uploadId === "string" ? body.uploadId : "";
  if (!id) return NextResponse.json({ error: "Send the upload id." }, { status: 400 });
  const row = await getFilmUpload(id).catch(() => null);
  const resumed = await resumeFilmUpload(row, row?.team ?? "");
  if (!resumed.ok) return NextResponse.json({ error: resumed.error }, { status: resumed.status });
  return NextResponse.json(resumed.data);
}
