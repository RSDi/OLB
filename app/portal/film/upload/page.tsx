import { notFound, redirect } from "next/navigation";
import { getViewer } from "../../../../lib/auth/viewer";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { memberDisplayName } from "../../../../lib/members/display";
import { canUseStaffUploader, listStaffUploadTeams } from "../../../../lib/film/staff-upload";
import { StaffUpload } from "./StaffUpload";

export const dynamic = "force-dynamic";

export default async function StaffFilmUploadPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/portal/film/upload");
  if (!canUseStaffUploader(viewer)) notFound();

  let teams: { id: string; label: string; ageGroup: string | null }[] = [];
  let loadError: string | null = null;
  try {
    teams = (await listStaffUploadTeams()).map((t) => ({ id: t.id, label: t.label, ageGroup: t.ageGroup }));
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Couldn't load teams.";
  }

  let name = "";
  try {
    const { data } = await createAdminClient()
      .from("members")
      .select("full_name, nickname")
      .eq("id", viewer.memberId)
      .maybeSingle();
    if (data?.full_name) name = memberDisplayName(data as { full_name: string; nickname: string | null });
  } catch {
    name = "";
  }

  return <StaffUpload teams={teams} defaultName={name} loadError={loadError} />;
}
