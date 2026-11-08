import type { Metadata } from "next";
import Image from "next/image";
import { loadLive } from "../../../lib/hosted/live";
import { gymClock, gymTimeLabel } from "../../../lib/hosted/clock";
import { formatWeekendDates } from "../../../lib/hs-schedule/logic";
import { portalFontVariables } from "../../portal/fonts";
import bolt from "../../(site)/_images/logo-bolt.png";
import { LiveBoard } from "./LiveBoard";
import s from "./live.module.css";

export const metadata: Metadata = {
  title: { absolute: "Live scores — Omaha Lightning Basketball" },
  description: "Live scores, standings and brackets for the tournament Omaha Lightning hosts.",
};

// Always the scores as they stand.
export const dynamic = "force-dynamic";

// The public live page (0165) at /shootout, the address on the QR signs: the
// tournament we host that a planner has turned on, no login. The scorer's
// tables enter finals at /shootout/score.
export default async function LivePage() {
  const data = await loadLive();
  // The days games are played, which can be narrower than the HS Schedule's weekend.
  const days = (data?.games ?? []).map((g) => g.plays_on).filter((d): d is string => !!d).sort();
  const dates = data ? formatWeekendDates(days[0] ?? data.startsOn, days[days.length - 1] ?? data.endsOn) : "";
  return (
    <div className={`${s.page} ${portalFontVariables}`}>
      <header className={s.head}>
        <div className={s.headInner}>
          <div className={s.headRow}>
            <Image src={bolt} alt="" className={s.bolt} priority sizes="52px" />
            <div style={{ minWidth: 0 }}>
              <div className={s.eyebrow}>Omaha Lightning presents</div>
              <h1 className={`${s.title} ${s.display}`}>{data?.event ?? "Live scores"}</h1>
            </div>
          </div>
          {data && (
            <div className={s.meta}>
              <span>{[dates, data.facility?.split("\n")[0]].filter(Boolean).join(" · ")}</span>
              <span className={s.updated}>
                <span className={s.dot} />
                Live
              </span>
            </div>
          )}
        </div>
      </header>
      <div style={{ height: 18 }} />
      {data ? (
        <LiveBoard data={data} now={gymClock()} updatedAt={gymTimeLabel()} />
      ) : (
        <div className={s.shell}>
          <div className={s.empty}>
            <b>Scores will be here on game day.</b>
            <p className={s.note} style={{ margin: "6px 0 0" }}>
              Check back when the tournament starts.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
