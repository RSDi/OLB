// POST /api/film/staff-upload — the staff uploader's version of
// /film/upload-token: the signed-in user picks the team instead of
// unlocking one with its code. Bytes never land here.

import { NextResponse } from "next/server";
import { getViewer } from "../../../../lib/auth/viewer";
import { canUseStaffUploader, findStaffUploadTeam } from "../../../../lib/film/staff-upload";
import { startFilmUpload } from "../../../../lib/film/upload-start";

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!canUseStaffUploader(viewer)) {
    return NextResponse.json({ error: "You can't upload film from here." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send the file details as JSON." }, { status: 400 });
  }

  let team;
  try {
    team = await findStaffUploadTeam(body.teamId);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't check that team." },
      { status: 500 }
    );
  }
  if (!team) return NextResponse.json({ error: "Pick a team first." }, { status: 400 });

  const started = await startFilmUpload(team, body);
  if (!started.ok) return NextResponse.json({ error: started.error }, { status: started.status });
  return NextResponse.json(started.data);
}
