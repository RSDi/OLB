import Link from "next/link";
import { loadBoard } from "../../../lib/teams/board-data";
import Board from "./_components/Board";

export const dynamic = "force-dynamic";

export default async function OlbBoardPage() {
  const data = await loadBoard();

  if (!data || data.teams.length === 0) {
    return (
      <div className="olb-page">
        <div className="olb-card olb-card--pad" style={{ maxWidth: 520 }}>
          <div className="olb-eyebrow">Team Manager</div>
          <h1 className="olb-h1" style={{ marginTop: 6, marginBottom: 6 }}>No teams yet</h1>
          <p className="olb-sub" style={{ marginTop: 0, marginBottom: 16 }}>
            Import the season roster spreadsheet to populate teams, players, and coaches.
          </p>
          <Link href="/portal/teams/import" className="olb-btn olb-btn--gold">Import spreadsheet</Link>
        </div>
      </div>
    );
  }

  return <Board initial={data} />;
}
