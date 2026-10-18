import { redirect } from "next/navigation";
import { getViewer } from "../../../lib/auth/viewer";
import { slackBotConfigured } from "../../../lib/notifications/slack";
import {
  listDiscardedFilmSlackDraftViews,
  listPendingFilmSlackDraftViews,
} from "../../../lib/film/slack-drafts";
import { listFilmUploads } from "../../../lib/film/uploads";
import { listEnabledFilmTeams } from "../../../lib/film/teams";
import { listGameLineupsByKey, listTeamRosters } from "../../../lib/film/lineups";
import type { FilmRosterPlayer } from "../../../lib/film/lineups";
import type { FilmSlackDraftView, FilmUpload } from "../../../lib/film/types";
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
          You need the <strong>Game film</strong> permission, <strong>Teams &amp; volunteers</strong>, or to be a
          video manager for a team, to open this. A super-admin can grant it in Settings → Members or Settings →
          Film.
        </div>
      </div>
    );
  }

  let uploads: FilmUpload[] = [];
  let slackDrafts: FilmSlackDraftView[] = [];
  let discardedDrafts: FilmSlackDraftView[] = [];
  let loadError: string | null = null;
  const teamScope = viewer.canViewAllFilm ? undefined : viewer.filmTeamIds;
  try {
    uploads = await listFilmUploads(teamScope);
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Couldn't load uploads.";
  }
  try {
    slackDrafts = await listPendingFilmSlackDraftViews(teamScope);
  } catch {
    slackDrafts = [];
  }
  try {
    discardedDrafts = viewer.canApproveFilmSlack ? await listDiscardedFilmSlackDraftViews(teamScope) : [];
  } catch {
    discardedDrafts = [];
  }

  let parentLinks: { slug: string; label: string }[] = [];
  const teamPlaylists: Record<string, string> = {};
  let rosters: Record<string, FilmRosterPlayer[]> = {};
  let lineups: Record<string, string[]> = {};
  try {
    const teams = await listEnabledFilmTeams();
    parentLinks = viewer.canViewAllFilm
      ? teams.map((t) => ({ slug: t.slug, label: t.label }))
      : teams.filter((t) => t.id && viewer.filmTeamIds.includes(t.id)).map((t) => ({ slug: t.slug, label: t.label }));
    for (const t of teams) {
      if (t.youtubePlaylistId) teamPlaylists[t.slug] = t.youtubePlaylistId;
    }
  } catch {
    parentLinks = [];
  }
  try {
    const teamIds = [...new Set(uploads.map((u) => u.team_id).filter((id): id is string => !!id))];
    [rosters, lineups] = await Promise.all([listTeamRosters(teamIds), listGameLineupsByKey(teamIds)]);
  } catch {
    rosters = {};
    lineups = {};
  }

  return (
    <FilmInbox
      uploads={uploads}
      slackDrafts={slackDrafts}
      discardedDrafts={discardedDrafts}
      canManage={viewer.canManageFilm}
      canApproveSlack={viewer.canApproveFilmSlack}
      slackConfigured={slackBotConfigured()}
      loadError={loadError}
      parentLinks={parentLinks}
      teamPlaylists={teamPlaylists}
      rosters={rosters}
      lineups={lineups}
    />
  );
}
