import type { Metadata } from "next";
import { loadLive } from "../../../../lib/hosted/live";
import { isScorer } from "../../../../lib/hosted/scorer";
import { gymClock } from "../../../../lib/hosted/clock";
import { portalFontVariables } from "../../../portal/fonts";
import { ScorerApp, PinForm } from "./ScorerApp";
import s from "../live.module.css";

export const metadata: Metadata = {
  title: { absolute: "Scorer's table — Omaha Lightning Basketball" },
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// The scorer's table (0165) at /shootout/score: the tournament PIN once,
// then every game on every court. ?court=2 opens on that court (the old
// court cards); without it, all courts. Works while the live page is on.
export default async function ScorePage({ searchParams }: { searchParams: Promise<{ court?: string }> }) {
  const { court } = await searchParams;
  const data = await loadLive();
  const n = Math.round(Number(court));
  const courts = data ? Math.max(data.courts, ...data.games.map((g) => g.court ?? 0)) : 4;
  const pick = n >= 1 && n <= courts ? n : null;
  return (
    <div className={`${s.page} ${portalFontVariables}`}>
      <header className={s.head}>
        <div className={s.headInner}>
          <div className={s.eyebrow}>Scorer&apos;s table{data ? ` · ${data.event}` : ""}</div>
          <h1 className={`${s.title} ${s.display}`}>All games</h1>
        </div>
      </header>
      <div style={{ height: 16 }} />
      {!data ? (
        <div className={s.sk}>
          <div className={s.empty}>Score entry opens on game day. Ask the tournament desk.</div>
        </div>
      ) : (await isScorer(data.weekendId)) ? (
        <ScorerApp data={data} court={pick} courts={courts} now={gymClock()} />
      ) : (
        <PinForm weekendId={data.weekendId} />
      )}
    </div>
  );
}
