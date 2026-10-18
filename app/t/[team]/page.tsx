import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { FILM_COOKIE, parseFilmSession, sessionMatchesTeam } from "../../../lib/film/session";
import { getFilmTeamBySlug } from "../../../lib/film/teams";
import { TeamUpload } from "./TeamUpload";

export const dynamic = "force-dynamic";

export default async function TeamFilmPage({ params }: { params: Promise<{ team: string }> }) {
  const { team: raw } = await params;
  let team;
  try {
    team = await getFilmTeamBySlug(raw);
  } catch {
    notFound();
  }
  if (!team || !team.enabled || !team.hasCode) notFound();

  const store = await cookies();
  const session = parseFilmSession(store.get(FILM_COOKIE)?.value);
  const unlocked = sessionMatchesTeam(session, team);

  return <TeamUpload team={team.slug} label={team.label} unlocked={unlocked} />;
}
