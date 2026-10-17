// Teams that accept game-film uploads. Slugs are the /t/[team] path; the
// shared code lives in env TEAM_CODE_<SLUG> (hyphens become underscores,
// uppercased), e.g. TEAM_CODE_14U_WHITE for /t/14u-white.
//
// Override the list with FILM_TEAMS="14u-white:14U White,14u-gold:14U Gold".
// Teams without a code set are hidden from /film and refuse unlock.

import type { FilmTeam } from "./types.ts";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const DEFAULT_TEAMS: FilmTeam[] = [
  { slug: "14u-white", label: "14U White", envKey: "TEAM_CODE_14U_WHITE" },
  { slug: "14u-gold", label: "14U Gold", envKey: "TEAM_CODE_14U_GOLD" },
];

export function teamCodeEnvKey(slug: string): string {
  return `TEAM_CODE_${slug.replace(/[^a-z0-9]+/gi, "_").toUpperCase().replace(/^_|_$/g, "")}`;
}

function parseFilmTeamsEnv(raw: string | undefined): FilmTeam[] | null {
  if (!raw?.trim()) return null;
  const out: FilmTeam[] = [];
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const colon = trimmed.indexOf(":");
    const slug = (colon === -1 ? trimmed : trimmed.slice(0, colon)).trim().toLowerCase();
    const label = (colon === -1 ? trimmed : trimmed.slice(colon + 1)).trim();
    if (!SLUG_RE.test(slug) || !label) continue;
    out.push({ slug, label, envKey: teamCodeEnvKey(slug) });
  }
  return out.length > 0 ? out : null;
}

export function filmTeams(env: Record<string, string | undefined> = process.env): FilmTeam[] {
  return parseFilmTeamsEnv(env.FILM_TEAMS) ?? DEFAULT_TEAMS;
}

export function filmTeam(slug: string, env: Record<string, string | undefined> = process.env): FilmTeam | null {
  const wanted = slug.trim().toLowerCase();
  return filmTeams(env).find((t) => t.slug === wanted) ?? null;
}

export function teamCode(slug: string, env: Record<string, string | undefined> = process.env): string | null {
  const team = filmTeam(slug, env);
  if (!team) return null;
  const code = env[team.envKey]?.trim();
  return code ? code : null;
}

export function configuredFilmTeams(env: Record<string, string | undefined> = process.env): FilmTeam[] {
  return filmTeams(env).filter((t) => !!env[t.envKey]?.trim());
}
