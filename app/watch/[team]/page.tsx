import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { parseTimecode } from "../../../lib/film/player-logic";
import { getWatchTeam, loadWatchPage } from "../../../lib/film/watch-data";
import { gameParts } from "../../../lib/film/watch";
import { WatchPage } from "./WatchPage";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ team: string }> }): Promise<Metadata> {
  const { team: key } = await params;
  const team = await getWatchTeam(key).catch(() => null);
  return { title: { absolute: team ? `${team.label} film — Omaha Lightning` : "Game film — Omaha Lightning" } };
}

export default async function TeamWatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ team: string }>;
  searchParams: Promise<{ v?: string; t?: string }>;
}) {
  const [{ team: key }, query] = await Promise.all([params, searchParams]);
  let data;
  try {
    data = await loadWatchPage(key);
  } catch {
    notFound();
  }
  if (!data) notFound();

  // A link shared while the game was streamed opens the recording now.
  const asked = typeof query.v === "string" ? query.v : "";
  const v = data.replacedBy[asked] ?? asked;
  const initial =
    v && data.games.some((g) => gameParts(g).some((p) => p.id === v))
      ? { id: v, t: parseTimecode(query.t ?? "0") ?? 0 }
      : null;

  return (
    <WatchPage
      pageKey={data.pageKey}
      teamLabel={data.team.label}
      teams={data.teams}
      games={data.games}
      markers={data.markers}
      initial={initial}
    />
  );
}
