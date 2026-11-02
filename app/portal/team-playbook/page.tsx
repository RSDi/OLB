import { redirect } from "next/navigation";
import { getViewer } from "../../../lib/auth/viewer";
import { createClient } from "../../../lib/supabase/server";
import { canEditPlaybook, loadPlaybook } from "../../../lib/team-playbook/data";
import type { PlaybookTeam, TeamPlay } from "../../../lib/team-playbook/types";
import { TeamPlaybook } from "./TeamPlaybook";

export const dynamic = "force-dynamic";
// Reading a play from a video runs after the upload's server action returns.
export const maxDuration = 300;

export default async function TeamPlaybookPage({ searchParams }: { searchParams: Promise<{ team?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/portal/team-playbook");
  if (viewer.status !== "approved" && viewer.role !== "super_admin") {
    return (
      <div className="rsd-card" style={{ padding: "40px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Team Playbook opens once you&apos;re approved</div>
        <div style={{ fontSize: 13, color: "var(--gw-fg-muted)" }}>A board member approves new accounts.</div>
      </div>
    );
  }

  const { team } = await searchParams;
  const [canEdit, nameRow] = await Promise.all([
    canEditPlaybook(viewer),
    (await createClient()).from("members").select("full_name").eq("id", viewer.memberId).maybeSingle(),
  ]);

  let plays: TeamPlay[] = [];
  let teams: PlaybookTeam[] = [];
  let loadError: string | null = null;
  try {
    ({ plays, teams } = await loadPlaybook());
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Couldn't load the plays.";
  }

  if (loadError) {
    return (
      <div className="rsd-card" style={{ padding: "40px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>The plays didn&apos;t load</div>
        <div style={{ fontSize: 13, color: "var(--gw-fg-muted)" }}>{loadError}</div>
      </div>
    );
  }

  return (
    <TeamPlaybook
      initialPlays={plays}
      teams={teams}
      canEdit={canEdit}
      viewerName={((nameRow.data as { full_name?: string } | null)?.full_name ?? "").trim()}
      initialTeam={team ?? null}
    />
  );
}
