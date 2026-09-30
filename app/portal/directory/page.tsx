import { AccessDenied } from "./_shared/AccessDenied";
import { loadPlayers, loadRequirements, loadViewer } from "./_shared/data";
import { PlayersList } from "./PlayersList";
import { holdsLeadershipRole, loadTeamsWithStaff } from "../../../lib/teams/volunteer-data";
import { countPendingRegistrations } from "../../../lib/teams/registration-data";

export default async function DirectoryPage() {
  // Started before the viewer check on purpose — see loadViewer().
  const players = loadPlayers();
  const teams = loadTeamsWithStaff();
  // Staff only by RLS; anyone else gets an empty list back.
  const requirements = loadRequirements();
  // The Registrations grant only by RLS; anyone else counts 0.
  const pending = countPendingRegistrations();
  const viewer = await loadViewer();
  if (!viewer) return <AccessDenied />;
  const { teams: teamList, roles } = await teams;
  const playerList = await players;
  const req = viewer.isStaff ? await requirements : { requirements: [], rows: [] };
  const playerIds = new Set(playerList.map((p) => p.id));

  // Everyone filters by team; the board (staff) and anyone holding a
  // leadership role (coaches) can also switch to age groups.
  const canViewAges = viewer.isStaff || holdsLeadershipRole(viewer.memberId, teamList, roles);

  return (
    <PlayersList
      players={playerList}
      isStaff={viewer.isStaff}
      teams={teamList}
      roles={roles}
      canViewAges={canViewAges}
      requirements={req.requirements}
      requirementRows={req.rows.filter((r) => playerIds.has(r.player_id))}
      canPlace={viewer.canManageRegistrations}
      pendingRegistrations={viewer.canManageRegistrations ? await pending : 0}
    />
  );
}
