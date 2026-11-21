import { redirect } from "next/navigation";
import { SettingsLink } from "../../components/SettingsLink";
import { getViewer } from "../../../lib/auth/viewer";
import { slackBotConfigured } from "../../../lib/notifications/slack";
import {
  listDiscardedFilmSlackDraftViews,
  listPendingFilmSlackDraftViews,
} from "../../../lib/film/slack-drafts";
import { listFilmUploads, loadFilmUploadStats, loadFilmYoutubeExtras } from "../../../lib/film/uploads";
import { listDirectoryFilmTeams, listEnabledFilmTeams } from "../../../lib/film/teams";
import { listGameLineupsByKey, listTeamRosters } from "../../../lib/film/lineups";
import type { FilmRosterPlayer } from "../../../lib/film/lineups";
import type { FilmSlackDraftView, FilmUpload, YoutubeEvent, YoutubeJob } from "../../../lib/film/types";
import { listFilmMarkers } from "../../../lib/film/markers";
import { getYoutubeWorkerError } from "../../../lib/film/youtube-settings";
import { parseTimecode, type FilmMarker } from "../../../lib/film/player-logic";
import { canUseStaffUploader } from "../../../lib/film/staff-upload";
import { FilmInbox } from "./FilmInbox";

export const dynamic = "force-dynamic";

export default async function FilmInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string; t?: string }>;
}) {
  const params = await searchParams;
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/portal/film");
  if (!viewer.canViewFilm) {
    return (
      <div className="rsd-card" style={{ padding: "40px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--gw-fg)", marginBottom: 6 }}>Film unavailable</div>
        <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500, lineHeight: 1.5 }}>
          You need the <strong>Game film</strong> permission, <strong>Teams &amp; volunteers</strong>, or to be a
          video manager for a team, to open this. A super-admin can grant it in{" "}
          <SettingsLink tab="members">Settings → Members</SettingsLink> or{" "}
          <SettingsLink tab="film">Settings → Film</SettingsLink>.
        </div>
      </div>
    );
  }

  let uploads: FilmUpload[] = [];
  let jobs: Record<string, YoutubeJob> = {};
  let events: Record<string, YoutubeEvent[]> = {};
  let uploadStats: Record<string, string> = {};
  let slackDrafts: FilmSlackDraftView[] = [];
  let discardedDrafts: FilmSlackDraftView[] = [];
  let loadError: string | null = null;
  const teamScope = viewer.canViewAllFilm ? undefined : viewer.filmTeamIds;
  try {
    uploads = await listFilmUploads(teamScope);
    uploadStats = await loadFilmUploadStats(uploads.map((u) => u.id));
    try {
      const extras = await loadFilmYoutubeExtras(uploads.map((u) => u.id));
      jobs = extras.jobs;
      events = extras.events;
    } catch {
      jobs = {};
      events = {};
    }
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

  let markers: Record<string, FilmMarker[]> = {};
  try {
    markers = await listFilmMarkers(uploads.map((u) => u.id));
  } catch {
    markers = {};
  }
  const youtubePaused = (await getYoutubeWorkerError())?.error ?? null;

  // Preview: streamed games go on teams that have a film address.
  let streamTeams: { id: string; label: string; slug: string }[] | null = null;
  if (viewer.seesFullUi && viewer.canManageFilm) {
    try {
      const { teams } = await listDirectoryFilmTeams();
      streamTeams = teams
        .filter((t) => t.hasSlug && (viewer.canViewAllFilm || viewer.filmTeamIds.includes(t.id)))
        .map((t) => ({ id: t.id, label: t.label, slug: t.slug }));
    } catch {
      streamTeams = null;
    }
  }

  const momentId = typeof params.v === "string" ? params.v : "";
  const initialMoment =
    momentId && uploads.some((u) => u.id === momentId)
      ? { id: momentId, t: parseTimecode(params.t ?? "0") ?? 0 }
      : null;

  return (
    <FilmInbox
      uploads={uploads}
      jobs={jobs}
      events={events}
      uploadStats={uploadStats}
      slackDrafts={slackDrafts}
      discardedDrafts={discardedDrafts}
      canManage={viewer.canManageFilm}
      canApproveSlack={viewer.canApproveFilmSlack}
      slackConfigured={slackBotConfigured()}
      loadError={loadError}
      youtubePaused={youtubePaused}
      parentLinks={parentLinks}
      canStaffUpload={canUseStaffUploader(viewer)}
      teamPlaylists={teamPlaylists}
      rosters={rosters}
      lineups={lineups}
      markers={markers}
      initialMoment={initialMoment}
      showEvents={viewer.seesFullUi}
      streamTeams={streamTeams}
    />
  );
}
