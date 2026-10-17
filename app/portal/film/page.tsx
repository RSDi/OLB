import { redirect } from "next/navigation";
import { getViewer } from "../../../lib/auth/viewer";
import { listFilmUploads } from "../../../lib/film/uploads";
import { listEnabledFilmTeams } from "../../../lib/film/teams";
import type { FilmUpload } from "../../../lib/film/types";
import { FilmInbox } from "./FilmInbox";

export const dynamic = "force-dynamic";

export default async function FilmInboxPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/portal/film");
  if (!viewer.canViewFilm) {
    return (
      <div className="rsd-card" style={{ padding: "40px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--gw-fg)", marginBottom: 6 }}>Film unavailable</div>
        <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500, lineHeight: 1.5 }}>
          You need the <strong>Game film</strong> permission, or to be a video manager for a team, to open this.
          A super-admin can grant it in Settings → Members or Settings → Film.
        </div>
      </div>
    );
  }

  let uploads: FilmUpload[] = [];
  let loadError: string | null = null;
  try {
    uploads = await listFilmUploads(viewer.canViewAllFilm ? undefined : viewer.filmTeamIds);
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Couldn't load uploads.";
  }

  let parentLinks: { slug: string; label: string }[] = [];
  try {
    const teams = await listEnabledFilmTeams();
    parentLinks = viewer.canViewAllFilm
      ? teams.map((t) => ({ slug: t.slug, label: t.label }))
      : teams.filter((t) => t.id && viewer.filmTeamIds.includes(t.id)).map((t) => ({ slug: t.slug, label: t.label }));
  } catch {
    parentLinks = [];
  }

  return (
    <FilmInbox
      uploads={uploads}
      canManage={viewer.canManageFilm}
      loadError={loadError}
      parentLinks={parentLinks}
    />
  );
}
