import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer } from "../../../../lib/auth/viewer";
import { canEditStats, loadSeasonTeams } from "../../../../lib/stats/data";
import { NoStatsAccess } from "../NoStatsAccess";
import { Upload } from "./Upload";
import s from "../stats.module.css";

export const dynamic = "force-dynamic";
// Reading a book runs inside the readBook server action called from here.
export const maxDuration = 300;

export default async function StatsUploadPage({ searchParams }: { searchParams: Promise<{ team?: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/portal/stats/upload");
  if (!(await canEditStats(viewer))) return <NoStatsAccess />;
  const { team } = await searchParams;
  const teams = await loadSeasonTeams();
  const initial = teams.find((t) => t.id === team)?.id ?? teams[0]?.id ?? "";
  return (
    <div className={s.page}>
      <Link href={`/portal/stats${initial ? `?team=${initial}` : ""}`} className={s.muted}>
        ← Stats
      </Link>
      <Upload teams={teams} initialTeam={initial} />
    </div>
  );
}
