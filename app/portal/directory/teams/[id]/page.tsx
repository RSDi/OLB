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

  // Filling roles is super-admin only (0092).
  const full = await getViewer();
  const canManage = !!full?.isSuperAdmin;
  const people = canManage ? await loadAssignablePeople() : [];

  // By jersey number; players without one go last, by name.
  const num = (n: string | null) => (n != null && /^\d+$/.test(n) ? Number(n) : Infinity);
  const roster = (await players)
    .filter((p) => p.team_id === id)
    .sort((a, b) => num(a.jersey_number) - num(b.jersey_number) || a.full_name.localeCompare(b.full_name));

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
