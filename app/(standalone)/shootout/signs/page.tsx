import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import QRCode from "qrcode";
import { getViewer } from "../../../../lib/auth/viewer";
import { viewerHsScheduleAccess } from "../../../../lib/hs-schedule/viewer";
import { createClient } from "../../../../lib/supabase/server";
import { portalFontVariables } from "../../../portal/fonts";
import bolt from "../../../(site)/_images/logo-bolt.png";
import { PrintButton } from "./PrintButton";
import s from "./signs.module.css";

export const metadata: Metadata = {
  title: { absolute: "Signs — Omaha Lightning Basketball" },
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const SITE = "https://omahalightningbasketball.com";
const LIVE_URL = `${SITE}/shootout`;

// Printable signs for the live page (0165), from the Brackets tab's Live
// scores box: a poster, a table tent for the admission tables, four cards to
// a sheet, and a card for each court's scorer's table. For the HS Schedule's
// planners. The PIN is never printed.
export default async function SignsPage({ searchParams }: { searchParams: Promise<{ w?: string }> }) {
  const viewer = await getViewer();
  const { w } = await searchParams;
  if (!viewer) redirect(`/login?next=${encodeURIComponent(`/shootout/signs${w ? `?w=${w}` : ""}`)}`);
  if ((await viewerHsScheduleAccess(viewer)) !== "edit") notFound();
  if (!w || !/^[0-9a-f-]{36}$/i.test(w)) notFound();
  const db = await createClient();
  const [{ data: wk }, { data: plan }, { data: games }] = await Promise.all([
    db.from("hs_weekends").select("event, starts_on, ends_on").eq("id", w).maybeSingle(),
    db.from("hs_hosted").select("courts, facility, admission").eq("weekend_id", w).maybeSingle(),
    db.from("hs_hosted_games").select("plays_on, court").eq("weekend_id", w),
  ]);
  const weekend = wk as { event: string; starts_on: string; ends_on: string } | null;
  const p = plan as { courts: number; facility: string | null; admission: string | null } | null;
  if (!weekend || !p) notFound();
  const gs = (games as { plays_on: string | null; court: number | null }[] | null) ?? [];
  const days = gs.map((g) => g.plays_on).filter((d): d is string => !!d).sort();
  const first = days[0] ?? weekend.starts_on;
  const last = days[days.length - 1] ?? weekend.ends_on;
  const courts = Math.max(p.courts, ...gs.map((g) => g.court ?? 0));
  const dateLine = datesLabel(first, last);
  const place = p.facility?.split("\n")[0] ?? "";

  const svg = (text: string) => QRCode.toString(text, { type: "svg", errorCorrectionLevel: "H", margin: 0, color: { dark: "#121417", light: "#ffffff" } });
  const liveQr = await svg(LIVE_URL);
  const courtQrs = await Promise.all(Array.from({ length: courts }, (_, i) => svg(`${LIVE_URL}/score?court=${i + 1}`)));

  const courtPages: number[][] = [];
  for (let i = 0; i < courts; i += 2) courtPages.push([i + 1, i + 2].filter((c) => c <= courts));

  return (
    <div className={`${s.wrap} ${portalFontVariables}`}>
      {/* The page itself prints with no margin, color or extra space around the sheets. */}
      <style>{"@media print { html, body { margin: 0 !important; padding: 0 !important; height: auto !important; background: #fff !important; } }"}</style>
      <div className={s.bar}>
        <div>
          <h1>Signs for {weekend.event}</h1>
          <p>
            Press Print: every sign comes out on its own Letter page, edge to edge (the table tent and cards print sideways). If a date or web address shows at
            the edges, turn off Headers and footers in the print box. The QR codes open {LIVE_URL.replace("https://", "")}; the court cards open score entry for
            that court. The PIN isn&apos;t printed: hand it out at the tournament desk.
          </p>
        </div>
        <PrintButton className={s.btn} />
      </div>
      <div className={s.sheets}>
        <div className={s.cap}>Poster · doors, lobby, each end of the gym, the cafe</div>
        <section className={`${s.sheet} ${s.port} ${s.poster}`}>
          <div className={`${s.stripe} ${s.gold}`} />
          <div className={s.top}>
            <div className={`${s.ev} ${s.display}`}>{weekend.event}</div>
            <div className={s.dt}>{[dateLine, place].filter(Boolean).join(" · ")}</div>
          </div>
          <div className={s.mid}>
            <div className={`${s.big} ${s.display}`}>
              Live scores
              <br />
              &amp; brackets
            </div>
            <Qr bolt={bolt.src} code={liveQr} className={s.posterQr} />
            <div>
              <div className={s.url}>{LIVE_URL.replace("https://", "")}</div>
              <div className={s.scan}>Point your phone camera at the code</div>
            </div>
          </div>
          {p.admission && (
            <div className={s.foot}>
              <div>
                <b>Admission</b>
                {p.admission}
              </div>
            </div>
          )}
          <div className={`${s.stripe} ${s.gold}`} />
        </section>

        <div className={s.cap}>Table tent · admission tables · fold on the dashed line</div>
        <section className={`${s.sheet} ${s.land}`}>
          <div className={`${s.turn} ${s.tent}`}>
          <div className={`${s.half} ${s.flip}`}>
            <div>
              <span className={s.tag}>{weekend.event}</span>
              <div className={`${s.big} ${s.display}`}>
                Scores, brackets
                <br />
                &amp; schedule
              </div>
            </div>
            <Qr bolt={bolt.src} code={liveQr} />
          </div>
          <div className={s.half}>
            <div>
              <span className={s.tag}>{p.admission ? "Admission" : weekend.event}</span>
              <div className={`${s.big} ${s.display}`}>
                Scan for live
                <br />
                scores
              </div>
              {p.admission && <div className={s.small}>{p.admission}</div>}
            </div>
            <Qr bolt={bolt.src} code={liveQr} />
          </div>
          </div>
        </section>

        <div className={s.cap}>Four cards · bleachers, cafe tables, hotel lobby, coaches&apos; packets · cut on the dashes</div>
        <section className={`${s.sheet} ${s.land}`}>
          <div className={`${s.turn} ${s.cards}`}>
          {["Live scores & brackets", "Who's playing next?", "Live scores & brackets", "Who's playing next?"].map((t, i) => (
            <div key={i} className={s.card}>
              <Qr bolt={bolt.src} code={liveQr} />
              <div>
                <div className={`${s.stripeSm} ${s.gold}`} />
                <div className={`${s.big} ${s.display}`}>{t}</div>
                <div className={s.tiny}>
                  {weekend.event} · {LIVE_URL.replace("https://", "")}
                </div>
              </div>
            </div>
          ))}
          </div>
        </section>

        <div className={s.cap}>Court cards · tape one at each scorer&apos;s table · cut in half</div>
        {courtPages.map((pair) => (
          <section key={pair[0]} className={`${s.sheet} ${s.port}`}>
            {pair.map((c) => (
              <div key={c} className={s.court}>
                <Qr bolt={bolt.src} code={courtQrs[c - 1]} badge={false} />
                <div>
                  <div className={s.k}>Scorer&apos;s table · not for fans</div>
                  <div className={`${s.c} ${s.display}`}>Court {c}</div>
                  <ol>
                    <li>Scan after the final horn</li>
                    <li>First time: type the PIN from the tournament desk</li>
                    <li>Type both scores, press Save final</li>
                  </ol>
                </div>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

function datesLabel(a: string, b: string): string {
  const f = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", ...o });
  if (a === b) return f(a, { month: "short", day: "numeric", year: "numeric" });
  const sameMonth = a.slice(0, 7) === b.slice(0, 7);
  return `${f(a, { month: "short", day: "numeric" })}–${sameMonth ? f(b, { day: "numeric" }) : f(b, { month: "short", day: "numeric" })}, ${b.slice(0, 4)}`;
}

function Qr({ code, bolt: boltSrc, badge = true, className = "" }: { code: string; bolt: string; badge?: boolean; className?: string }) {
  return (
    <div className={`${s.qr} ${className}`}>
      <div dangerouslySetInnerHTML={{ __html: code }} />
      {badge && (
        <span className={s.badge}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={boltSrc} alt="" />
        </span>
      )}
    </div>
  );
}
