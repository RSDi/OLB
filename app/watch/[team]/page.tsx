import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { parseTimecode } from "../../../lib/film/player-logic";
import { getWatchTeam, loadWatchPage } from "../../../lib/film/watch-data";
import { WatchPage } from "./WatchPage";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ team: string }> }): Promise<Metadata> {
  const { team: slug } = await params;
  const team = await getWatchTeam(slug).catch(() => null);
  return { title: { absolute: team ? `${team.label} film — Omaha Lightning` : "Game film — Omaha Lightning" } };
}

export default async function TeamWatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ team: string }>;
  searchParams: Promise<{ v?: string; t?: string }>;
}) {
  const [{ team: slug }, query] = await Promise.all([params, searchParams]);
  let data;
  try {
    data = await loadWatchPage(slug);
  } catch {
    notFound();
  }
  if (!data) notFound();

  const v = typeof query.v === "string" ? query.v : "";
  const initial =
    v && data.games.some((g) => g.id === v) ? { id: v, t: parseTimecode(query.t ?? "0") ?? 0 } : null;

  return (
    <WatchPage
      slug={data.team.slug}
      teamLabel={data.team.label}
      teams={data.teams}
      games={data.games}
      markers={data.markers}
      initial={initial}
    />
  );
}
