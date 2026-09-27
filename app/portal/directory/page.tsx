import { AccessDenied } from "./_shared/AccessDenied";
import { loadPlayers, loadViewer } from "./_shared/data";
import { PlayersList } from "./PlayersList";

export default async function DirectoryPage() {
  // Started before the viewer check on purpose — see loadViewer().
  const players = loadPlayers();
  const viewer = await loadViewer();
  if (!viewer) return <AccessDenied />;

  return <PlayersList players={await players} isStaff={viewer.isStaff} />;
}
