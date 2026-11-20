// The staff uploader (/portal/film/upload): a signed-in portal user picks
// any team and uploads, no team code. Still in preview, so it's limited to
// the accounts in lib/auth/feature-preview.ts who can also see every team's
// film. Page and API routes share this check.

import type { Viewer } from "../auth/viewer";
import { listDirectoryFilmTeams, type FilmTeamRow } from "./teams";

export function canUseStaffUploader(viewer: Pick<Viewer, "seesFullUi" | "canViewAllFilm"> | null): boolean {
  return !!viewer && viewer.seesFullUi && viewer.canViewAllFilm;
}

// Every team on the current season's board, film page on or not.
export async function listStaffUploadTeams(): Promise<FilmTeamRow[]> {
  const { teams } = await listDirectoryFilmTeams();
  return teams;
}

export async function findStaffUploadTeam(teamId: unknown): Promise<FilmTeamRow | null> {
  if (typeof teamId !== "string" || !teamId) return null;
  const teams = await listStaffUploadTeams();
  return teams.find((t) => t.id === teamId) ?? null;
}
