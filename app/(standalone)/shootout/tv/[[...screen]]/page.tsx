import type { Metadata } from "next";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { loadAdmission, loadLive } from "../../../../../lib/hosted/live";
import { gymClock, gymTimeLabel } from "../../../../../lib/hosted/clock";
import { formatWeekendDates } from "../../../../../lib/hs-schedule/logic";
import { portalFontVariables } from "../../../../portal/fonts";
import { tvSlug } from "../../../../../lib/hosted/live-view";
import { TvBoard } from "../TvBoard";
import { AdmissionBoard } from "../AdmissionBoard";

export async function generateMetadata({ params }: { params: Promise<{ screen?: string[] }> }): Promise<Metadata> {
  const { screen } = await params;
  const name = screen?.[0]?.toLowerCase() === "admission" ? "Admission" : "Scoreboard";
  return { title: { absolute: `${name} — Omaha Lightning Basketball` }, robots: { index: false, follow: false } };
}

// Always the scores as they stand.
export const dynamic = "force-dynamic";

const LIVE_URL = "https://omahalightningbasketball.com/shootout";

// The live page for a TV (a Fire Stick's browser, a laptop on the gym's
// screen): /shootout/tv turns through the courts and each division;
// /shootout/tv/courts or /shootout/tv/hsa stays on one screen. ?s=20 sets
// the seconds per screen. Same data and same on/off switch as /shootout.
// /shootout/tv/admission is the prices for a TV at the door, shown even
// while the live page is off.
export default async function TvPage({ params, searchParams }: { params: Promise<{ screen?: string[] }>; searchParams: Promise<{ s?: string }> }) {
  const [{ screen }, { s }] = await Promise.all([params, searchParams]);
  if (screen && screen.length > 1) notFound();
  const pin = screen?.[0]?.toLowerCase() ?? null;
  const qr = await QRCode.toString(LIVE_URL, { type: "svg", errorCorrectionLevel: "M", margin: 0, color: { dark: "#121417", light: "#ffffff" } });
  if (pin === "admission") {
    const adm = await loadAdmission();
    const admDates = adm ? formatWeekendDates(adm.gameDays[0] ?? adm.startsOn, adm.gameDays[adm.gameDays.length - 1] ?? adm.endsOn) : "";
    return (
      <div className={portalFontVariables}>
        <AdmissionBoard data={adm} dates={admDates} qr={qr} />
      </div>
    );
  }
  const data = await loadLive();
  if (data && pin && pin !== "courts" && pin !== "partners" && !data.divisions.some((d) => tvSlug(d) === pin)) notFound();
  const seconds = Math.min(120, Math.max(6, Number(s) || 15));
  const days = (data?.games ?? []).map((g) => g.plays_on).filter((d): d is string => !!d).sort();
  const dates = data ? formatWeekendDates(days[0] ?? data.startsOn, days[days.length - 1] ?? data.endsOn) : "";
  return (
    <div className={portalFontVariables}>
      <TvBoard data={data} now={gymClock()} clock={gymTimeLabel()} dates={dates} qr={qr} pin={pin} seconds={seconds} />
    </div>
  );
}
