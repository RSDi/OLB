import { redirect } from "next/navigation";
import { getViewer } from "../../../../lib/auth/viewer";
import { listEnabledFilmTeams } from "../../../../lib/film/teams";
import { getYoutubeConnection } from "../../../../lib/film/youtube-settings";
import { listFilmUploads, loadFilmYoutubeExtras } from "../../../../lib/film/uploads";
import type { FilmUpload, YoutubeEvent, YoutubeJob } from "../../../../lib/film/types";
import { FilmStatusBoard } from "./FilmStatusBoard";

export const dynamic = "force-dynamic";

export default async function FilmStatusPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/portal/film/status");
  if (!viewer.canViewFilm) {
    return (
      <div className="rsd-card" style={{ padding: "40px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--gw-fg)", marginBottom: 6 }}>Film unavailable</div>
        <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500, lineHeight: 1.5 }}>
          You need the <strong>Game film</strong> permission, <strong>Teams &amp; volunteers</strong>, or to be a
          video manager for a team, to open this. A super-admin can grant it in Settings → Members or Settings →
          Film.
        </div>
      </div>
    );
  }

  let uploads: FilmUpload[] = [];
  let jobs: Record<string, YoutubeJob> = {};
  let events: Record<string, YoutubeEvent[]> = {};
  let loadError: string | null = null;
  const labels: Record<string, string> = {};
  const teamScope = viewer.canViewAllFilm ? undefined : viewer.filmTeamIds;
  try {
    uploads = await listFilmUploads(teamScope);
    const extras = await loadFilmYoutubeExtras(uploads.map((u) => u.id));
    jobs = extras.jobs;
    events = extras.events;
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Couldn't load film status.";
  }
  try {
    const teams = await listEnabledFilmTeams();
    for (const t of teams) labels[t.slug] = t.label;
  } catch {
    /* labels stay empty; slugs still show */
  }

  let youtubeAuthError: string | null = null;
  try {
    youtubeAuthError = (await getYoutubeConnection()).authError;
  } catch {
    /* no banner if the connection row can't be read */
  }

  return (
    <FilmStatusBoard
      uploads={uploads}
      jobs={jobs}
      events={events}
      labels={labels}
      canManage={viewer.canManageFilm}
      loadError={loadError}
      youtubeAuthError={youtubeAuthError}
    />
  );
}
