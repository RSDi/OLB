import { AccessDenied } from "./_shared/AccessDenied";
import { loadPlayers, loadViewer } from "./_shared/data";
import { PlayersList } from "./PlayersList";
import { holdsLeadershipRole, loadTeamsWithStaff } from "../../../lib/teams/volunteer-data";

export default async function DirectoryPage() {
  // Started before the viewer check on purpose — see loadViewer().
  const players = loadPlayers();
  const teams = loadTeamsWithStaff();
  const viewer = await loadViewer();
  if (!viewer) return <AccessDenied />;
  const { teams: teamList, roles } = await teams;

  // Everyone filters by team; the board (staff) and anyone holding a
  // leadership role (coaches) can also switch to age groups.
  const canViewAges = viewer.isStaff || holdsLeadershipRole(viewer.memberId, teamList, roles);

  return (
    <PlayersList
      players={await players}
      isStaff={viewer.isStaff}
      teams={teamList}
      roles={roles}
      canViewAges={canViewAges}
    />
  );
}
