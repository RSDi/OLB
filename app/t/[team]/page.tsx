import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { FILM_COOKIE, parseFilmSession } from "../../../lib/film/session";
import { filmTeam, teamCode } from "../../../lib/film/teams";
import { TeamUpload } from "./TeamUpload";

export const dynamic = "force-dynamic";

export default async function TeamFilmPage({ params }: { params: Promise<{ team: string }> }) {
  const { team: raw } = await params;
  const team = filmTeam(raw);
  if (!team || !teamCode(team.slug)) notFound();

  const store = await cookies();
  const sessionTeam = parseFilmSession(store.get(FILM_COOKIE)?.value);
  const unlocked = sessionTeam === team.slug;

  return <TeamUpload team={team.slug} label={team.label} unlocked={unlocked} />;
}
