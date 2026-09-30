import { notFound } from "next/navigation";
import { getViewer } from "../../../../../lib/auth/viewer";
import { loadPaymentsData, myPlayerIds } from "../../../../../lib/finances/data";
import { groupFamilies } from "../../../../../lib/finances/logic";
import type { PaymentsData } from "../../../../../lib/finances/types";
import { AccessDenied } from "../../_shared/AccessDenied";
import { loadPlayers, loadRequirements, loadViewer } from "../../_shared/data";
import { PlayerDetail } from "./PlayerDetail";
import { loadSeasonTeams } from "../../../../../lib/teams/volunteer-data";

// One player: everything on their Directory card, their parents and brothers
// and sisters, and their family's payments. Payments show to anyone with the
// Payments grant, and to the player's own parents once the Treasurer has
// opened balances to families. Who can see the player at all is RLS's call,
// the same as the Directory. Anyone with the Registrations permission can also
// put the player on a team, edit them, or take them off the roster.
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

  const req = viewer.isStaff ? await requirements : { requirements: [], rows: [] };
  const teams = viewer.canManageRegistrations ? await loadSeasonTeams() : null;

  return (
    <PlayerDetail
      player={player}
      siblings={siblings}
      isStaff={viewer.isStaff}
      requirements={req.requirements}
      requirementRows={req.rows.filter((r) => r.player_id === id)}
      payments={payments}
      canManageFinances={canManageFinances}
      teams={teams}
    />
  );
}
