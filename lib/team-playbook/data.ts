// Server-only: the Team Playbook page's data and who can edit it.

import { createClient } from "../supabase/server";
import { createAdminClient } from "../supabase/admin";
import { getViewer, viewerIsCoach, type Viewer } from "../auth/viewer";
import { normalizeDiagram } from "./diagram.ts";
import { PLAYBOOK_BUCKET, VIDEO_LINK_TTL_S, type PlaybookTeam, type TeamPlay } from "./types.ts";

// The board, coaches and Teams & volunteers: the same people as
// can_edit_playbook() (0162).
export async function canEditPlaybook(viewer: Viewer | null): Promise<boolean> {
  if (!viewer) return false;
  if (viewer.isStaff || viewer.canManageTeams) return true;
  return viewerIsCoach(viewer);
}

export async function requirePlaybookEditor(): Promise<{ userId: string } | { error: string }> {
  const viewer = await getViewer();
  if (!viewer) return { error: "You must be signed in." };
  if (!(await canEditPlaybook(viewer))) return { error: "Only coaches and the board can change the playbook." };
  return { userId: viewer.userId };
}

export const PLAY_COLS =
  "id, name, call_name, category, team_ids, coach_name, status, error, diagram, video_path, video_name, video_link, duration_sec, transcript, created_at, updated_at, shared_at";

type PlayRow = Omit<TeamPlay, "video_url"> & { video_path: string | null };

export async function toTeamPlays(rows: PlayRow[]): Promise<TeamPlay[]> {
  const paths = rows.map((r) => r.video_path).filter((p): p is string => !!p);
  const urls = new Map<string, string>();
  if (paths.length) {
    const admin = createAdminClient();
    const { data } = await admin.storage.from(PLAYBOOK_BUCKET).createSignedUrls(paths, VIDEO_LINK_TTL_S);
    for (const s of data ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  }
  return rows.map(({ video_path, ...r }) => ({
    ...r,
    team_ids: r.team_ids ?? [],
    diagram: normalizeDiagram(r.diagram),
    video_url: video_path ? (urls.get(video_path) ?? null) : null,
  }));
}

// Plays the viewer can see (RLS: shared plays, plus drafts for editors), and
// this season's teams for the team filter.
export async function loadPlaybook(): Promise<{ plays: TeamPlay[]; teams: PlaybookTeam[] }> {
  const db = await createClient();
  const [{ data, error }, teams] = await Promise.all([
    db.from("team_plays").select(PLAY_COLS).order("sort_order").order("created_at", { ascending: false }),
    loadSeasonTeams(),
  ]);
  if (error) throw new Error(error.message);
  return { plays: await toTeamPlays((data as PlayRow[] | null) ?? []), teams };
}

async function loadSeasonTeams(): Promise<PlaybookTeam[]> {
  const admin = createAdminClient();
  const { data: board } = await admin
    .from("olb_boards")
    .select("id")
    .order("season", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!board) return [];
  const { data } = await admin
    .from("olb_teams")
    .select("id, name")
    .eq("board_id", board.id)
    .order("sort_order")
    .order("name");
  return ((data as PlaybookTeam[] | null) ?? []).map((t) => ({ id: t.id, name: t.name }));
}
