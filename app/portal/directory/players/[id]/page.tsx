import { notFound } from "next/navigation";
import { getViewer } from "../../../../../lib/auth/viewer";
import { loadPaymentsData, myPlayerIds } from "../../../../../lib/finances/data";
import { groupFamilies } from "../../../../../lib/finances/logic";
import type { PaymentsData } from "../../../../../lib/finances/types";
import { AccessDenied } from "../../_shared/AccessDenied";
import { loadPlayerMessages, loadPlayers, loadRequirements, loadViewer } from "../../_shared/data";
import { PlayerDetail } from "./PlayerDetail";
import { loadSeasonTeams } from "../../../../../lib/teams/volunteer-data";
import { loadPlayerNotes } from "../../../../../lib/teams/player-note-data";
import { loadEligibilityContext } from "../../../../../lib/teams/eligibility-data";

// One player: everything on their Directory card, their parents and brothers
// and sisters, and their family's payments. Payments show to anyone with the
// Payments grant, and to the player's own parents once the Treasurer has
// opened balances to families. Who can see the player at all is RLS's call,
// the same as the Directory. Anyone with the Registrations permission can also
// put the player on a team, edit them, or take them off the roster; they and
// the board can email the family and keep notes on them, and the Slack DMs
// grant can Slack them.
export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Started before the viewer check on purpose — see loadViewer().
  const players = loadPlayers();
  // Staff only by RLS; anyone else gets an empty list back.
  const requirements = loadRequirements();
  const viewer = await loadViewer();
  if (!viewer) return <AccessDenied />;

  const all = await players;
  const player = all.find((p) => p.id === id);
  if (!player) notFound();

  // Brothers and sisters: the players who share a parent with this one.
  const family =
    groupFamilies(
      all.map((p) => ({ id: p.id, full_name: p.full_name, parent_ids: p.parents.map((pa) => pa.member!.id) }))
    ).find((f) => f.some((p) => p.id === id)) ?? [];
  const familyIds = family.map((p) => p.id);
  const siblings = all.filter((p) => p.id !== id && familyIds.includes(p.id));

  const full = await getViewer();
  const canManageFinances = !!full?.canManageFinances;
  let payments: PaymentsData | null = null;
  if (canManageFinances) {
    payments = await loadPaymentsData({ onlyPlayerIds: familyIds });
  } else {
    const mine = await myPlayerIds(viewer.memberId);
    if (mine.includes(id)) {
      const data = await loadPaymentsData({ onlyPlayerIds: mine });
      if (data?.board.parent_balances_visible) payments = data;
    }
  }

  const req = viewer.canCheckRequirements ? await requirements : { requirements: [], rows: [] };
  const teams = viewer.canManageRegistrations ? await loadSeasonTeams() : null;
  // Board, Registrations, or Travel can email (0116/0134); Slack DMs grant
  // or Travel can Slack them (0118/0134). Either sees what was sent.
  const canEmail = viewer.canEmailFamilies;
  const canSlack = viewer.canSlackDm;
  // The whole family's history: a message or note from a brother's or
  // sister's page shows here too.
  const familyFirst = family.map((f) => ({ id: f.id, first_name: f.full_name.trim().split(/\s+/)[0] ?? f.full_name }));
  const messages = canEmail || canSlack || canManageFinances ? await loadPlayerMessages(id, familyFirst) : [];
  // Notes (0124): the board and the Registrations grant.
  const canNote = viewer.isStaff || viewer.canManageRegistrations;
  const notes = canNote ? await loadPlayerNotes(id, { userId: viewer.userId, isSuperAdmin: viewer.isSuperAdmin }, familyFirst) : null;
  const eligibility = viewer.isStaff ? await loadEligibilityContext() : null;

  return (
    <PlayerDetail
      player={player}
      siblings={siblings}
      isStaff={viewer.canSeeAllPlayers}
      canSeeBirthdates={viewer.isStaff}
      eligibility={eligibility}
      requirements={req.requirements}
      requirementRows={req.rows.filter((r) => r.player_id === id)}
      payments={payments}
      canManageFinances={canManageFinances}
      teams={teams}
      canEmail={canEmail}
      canSlack={canSlack}
      messages={messages}
      notes={notes}
    />
  );
}
