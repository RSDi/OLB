import { notFound } from "next/navigation";
import { getViewer } from "../../../../../lib/auth/viewer";
import {
  loadAssignablePeople,
  loadTeamWithStaff,
} from "../../../../../lib/teams/volunteer-data";
import { AccessDenied } from "../../_shared/AccessDenied";
import { loadPlayers, loadViewer } from "../../_shared/data";
import { TeamView } from "./TeamView";

export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Started before the viewer check on purpose — see loadViewer().
  const players = loadPlayers();
  const team = loadTeamWithStaff(id);
  const viewer = await loadViewer();
  if (!viewer) return <AccessDenied />;
  const data = await team;
  if (!data) notFound();

  // Filling roles is super-admin only, and for now only shows for the
  // staged-rollout accounts (lib/auth/feature-preview.ts).
  const full = await getViewer();
  const canManage = !!full?.isSuperAdmin && !!full?.seesFullUi;
  const people = canManage ? await loadAssignablePeople() : [];

  const roster = (await players).filter((p) => p.team_id === id);

  return (
    <TeamView
      team={data.team}
      roles={data.roles}
      roster={roster}
      canManage={canManage}
      people={people}
      teamParentIds={[...new Set(roster.flatMap((p) => p.parents.map((pa) => pa.member!.id)))]}
    />
  );
}
