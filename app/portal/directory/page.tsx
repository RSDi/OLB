import { AccessDenied } from "./_shared/AccessDenied";
import { loadPlayers, loadRequirements, loadViewer } from "./_shared/data";
import { PlayersList } from "./PlayersList";
import { holdsLeadershipRole, loadTeamsWithStaff } from "../../../lib/teams/volunteer-data";
import { countRegistrations } from "../../../lib/teams/registration-data";
import { countPlayerNotes } from "../../../lib/teams/player-note-data";
import { createClient } from "../../../lib/supabase/server";
import { loadDirectoryHotelStays, loadHotelStayPlayers } from "../../../lib/hs-hotel-stays/data";
import { loadEligibilityContext } from "../../../lib/teams/eligibility-data";

export default async function DirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{ hotelStay?: string }>;
}) {
  // Started before the viewer check on purpose — see loadViewer().
  const players = loadPlayers();
  const teams = loadTeamsWithStaff();
  // Board, Check off requirements, or Travel (0134); anyone else gets an
  // empty list back by RLS.
  const requirements = loadRequirements();
  const params = await searchParams;
  const viewer = await loadViewer();
  if (!viewer) return <AccessDenied />;
  const { teams: teamList, roles } = await teams;
  const playerList = await players;
  const req = viewer.canCheckRequirements ? await requirements : { requirements: [], rows: [] };
  const playerIds = new Set(playerList.map((p) => p.id));
  // Hotel stays (0135/0137): Travel and the board track Booked in block per
  // event. Travel's current-season player read (0137) is what fills the
  // tracker list, counts and sibling picker for opted-out families.
  const canStays = viewer.canManageTravel || viewer.isStaff;
  const supabase = canStays ? await createClient() : null;
  const hotelStays = supabase ? await loadDirectoryHotelStays(supabase) : [];
  const stayRows = supabase ? await loadHotelStayPlayers(supabase, hotelStays.map((s) => s.id)) : [];
  // New, waitlisted and removed registrations, for the Registrations button
  // and the team filter.
  const registrations = viewer.canManageRegistrations ? await countRegistrations() : null;
  // Notes on players (0124), for a chip on their card: the board and the
  // Registrations grant.
  const noteCounts = viewer.isStaff || viewer.canManageRegistrations ? await countPlayerNotes() : null;
  // Birthdates and eligibility are board-only (members.role admin / super_admin).
  const eligibility = viewer.isStaff ? await loadEligibilityContext() : null;

  // Everyone filters by team; the board (staff) and anyone holding a
  // leadership role (coaches) can also switch to age groups.
  const canViewAges = viewer.isStaff || holdsLeadershipRole(viewer.memberId, teamList, roles);

  return (
    <PlayersList
      players={playerList}
      isStaff={viewer.canSeeAllPlayers}
      canSeeBirthdates={viewer.isStaff}
      eligibility={eligibility}
      teams={teamList}
      roles={roles}
      canViewAges={canViewAges}
      requirements={req.requirements}
      requirementRows={req.rows.filter((r) => playerIds.has(r.player_id))}
      hotelStays={hotelStays}
      hotelStayRows={stayRows.filter((r) => playerIds.has(r.player_id))}
      canManageHotelStays={canStays}
      initialStayId={params.hotelStay ?? null}
      canPlace={viewer.canManageRegistrations}
      canEmail={viewer.canEmailFamilies}
      canSlack={viewer.canSlackDm}
      registrations={registrations}
      noteCounts={noteCounts}
    />
  );
}
