import { AccessDenied } from "./_shared/AccessDenied";
import { loadPlayers, loadRequirements, loadViewer } from "./_shared/data";
import { PlayersList } from "./PlayersList";
import { holdsLeadershipRole, loadTeamsWithStaff } from "../../../lib/teams/volunteer-data";
import { countRegistrations } from "../../../lib/teams/registration-data";
import { countPlayerNotes } from "../../../lib/teams/player-note-data";

export default async function DirectoryPage() {
  // Started before the viewer check on purpose — see loadViewer().
  const players = loadPlayers();
  const teams = loadTeamsWithStaff();
  // Board and the Check off requirements permission only, by RLS; anyone
  // else gets an empty list back.
  const requirements = loadRequirements();
  const viewer = await loadViewer();
  if (!viewer) return <AccessDenied />;
  const { teams: teamList, roles } = await teams;
  const playerList = await players;
  const req = viewer.canCheckRequirements ? await requirements : { requirements: [], rows: [] };
  const playerIds = new Set(playerList.map((p) => p.id));
  // New, waitlisted and removed registrations, for the Registrations button
  // and the team filter.
  const registrations = viewer.canManageRegistrations ? await countRegistrations() : null;
  // Notes on players (0124), for a chip on their card: the board and the
  // Registrations grant.
  const noteCounts = viewer.isStaff || viewer.canManageRegistrations ? await countPlayerNotes() : null;

  // Everyone filters by team; the board (staff) and anyone holding a
  // leadership role (coaches) can also switch to age groups.
  const canViewAges = viewer.isStaff || holdsLeadershipRole(viewer.memberId, teamList, roles);

  return (
    <PlayersList
      players={playerList}
      isStaff={viewer.canSeeAllPlayers}
      teams={teamList}
      roles={roles}
      canViewAges={canViewAges}
      requirements={req.requirements}
      requirementRows={req.rows.filter((r) => playerIds.has(r.player_id))}
      canPlace={viewer.canManageRegistrations}
      canEmail={viewer.isStaff || viewer.canManageRegistrations}
      canSlack={viewer.canSlackDm}
      registrations={registrations}
      noteCounts={noteCounts}
    />
  );
}
