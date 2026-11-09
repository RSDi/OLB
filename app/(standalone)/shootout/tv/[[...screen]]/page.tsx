import type { Metadata } from "next";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { loadLive } from "../../../../../lib/hosted/live";
import { gymClock, gymTimeLabel } from "../../../../../lib/hosted/clock";
import { formatWeekendDates } from "../../../../../lib/hs-schedule/logic";
import { portalFontVariables } from "../../../../portal/fonts";
import { tvSlug } from "../../../../../lib/hosted/live-view";
import { TvBoard } from "../TvBoard";

export const metadata: Metadata = {
  title: { absolute: "Scoreboard — Omaha Lightning Basketball" },
  robots: { index: false, follow: false },
};

// Always the scores as they stand.
export const dynamic = "force-dynamic";

const LIVE_URL = "https://omahalightningbasketball.com/shootout";

// The live page for a TV (a Fire Stick's browser, a laptop on the gym's
// screen): /shootout/tv turns through the courts and each division;
// /shootout/tv/courts or /shootout/tv/hsa stays on one screen. ?s=20 sets
// the seconds per screen. Same data and same on/off switch as /shootout.
export default async function TvPage({ params, searchParams }: { params: Promise<{ screen?: string[] }>; searchParams: Promise<{ s?: string }> }) {
  const [{ screen }, { s }] = await Promise.all([params, searchParams]);
  if (screen && screen.length > 1) notFound();
  const pin = screen?.[0]?.toLowerCase() ?? null;
  const data = await loadLive();
  if (data && pin && pin !== "courts" && !data.divisions.some((d) => tvSlug(d) === pin)) notFound();
  const seconds = Math.min(120, Math.max(6, Number(s) || 15));
  const days = (data?.games ?? []).map((g) => g.plays_on).filter((d): d is string => !!d).sort();
  const dates = data ? formatWeekendDates(days[0] ?? data.startsOn, days[days.length - 1] ?? data.endsOn) : "";
  const qr = await QRCode.toString(LIVE_URL, { type: "svg", errorCorrectionLevel: "M", margin: 0, color: { dark: "#121417", light: "#ffffff" } });
  return (
    <div className={portalFontVariables}>
      <TvBoard data={data} now={gymClock()} clock={gymTimeLabel()} dates={dates} qr={qr} pin={pin} seconds={seconds} />
    </div>
  );
}
