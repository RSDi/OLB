"use client";
// Live scores (0165), at the top of the Brackets tab: turn the public page
// (/shootout) on, make the PIN for the scorer's tables, and print the signs
// with the QR code. Jeff-only until it's released.

import Link from "next/link";
import { Pill } from "../../../../../components/ui";
import { newScorerPin, setLivePublic } from "../../../../../../lib/hosted/actions";
import type { HostedPageData } from "../../../../../../lib/hosted/types";
import { tvSlug } from "../../../../../../lib/hosted/live-view";
import { Said, Section, sub } from "./parts";
import { useAct } from "./parts";

export function LivePanel({ data }: { data: HostedPageData }) {
  const { busy, error, notice, act } = useAct();
  const { plan, weekend } = data;
  const on = plan.live_public;
  const pin = plan.scorer_pin;
  return (
    <Section
      title="Live scores"
      tour="hosted-live"
      subtitle={on ? "On: anyone with the QR code sees scores, standings and brackets." : "Off: the public page says scores will be there on game day."}
      action={
        <>
          <Pill size="sm" variant={on ? "ghost" : "accent"} disabled={busy} onClick={() => act(() => setLivePublic(weekend.id, !on))}>
            {on ? "Turn off" : "Turn on the live page"}
          </Pill>
          <Link href={`/shootout/signs?w=${weekend.id}`} target="_blank" style={{ fontSize: 12, fontWeight: 700, alignSelf: "center" }}>
            Print the signs
          </Link>
        </>
      }
    >
      <Said error={error} notice={notice} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        <div style={box}>
          <span style={label}>Live page</span>
          <a href="/shootout" target="_blank" rel="noreferrer" style={{ fontWeight: 800, fontSize: 15 }}>
            omahalightningbasketball.com/shootout
          </a>
          <span style={sub}>The address on the QR signs. It refreshes itself every 30 seconds.</span>
        </div>
        <div style={box}>
          <span style={label}>TV screens</span>
          <a href="/shootout/tv" target="_blank" rel="noreferrer" style={{ fontWeight: 800, fontSize: 15 }}>
            Scoreboard: omahalightningbasketball.com/shootout/tv
          </a>
          <a href="/shootout/tv/admission" target="_blank" rel="noreferrer" style={{ fontWeight: 800, fontSize: 15 }}>
            Admission: omahalightningbasketball.com/shootout/tv/admission
          </a>
          <span style={sub}>
            For a TV (a Fire Stick&apos;s Silk browser works); press OK on the remote for full screen. The scoreboard turns through the courts and each division;
            add /courts or a division&apos;s code to stay on one, like /shootout/tv/{data.divisions[0] ? tvSlug(data.divisions[0]) : "hsa"}. Admission shows the prices
            from Details, even while the live page is off.
          </span>
        </div>
        <div style={box}>
          <span style={label}>Scorer&apos;s table PIN</span>
          <span style={{ fontSize: 28, fontWeight: 800, letterSpacing: ".12em", fontVariantNumeric: "tabular-nums" }}>{pin ?? "None yet"}</span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <Pill
              size="sm"
              variant={pin ? "ghost" : "accent"}
              disabled={busy}
              onClick={() => {
                if (pin && !confirm("Make a new PIN? Every scorer's phone will need to type the new one.")) return;
                act(() => newScorerPin(weekend.id));
              }}
            >
              {pin ? "New PIN" : "Make a PIN"}
            </Pill>
          </div>
          <span style={sub}>Hand it out at the tournament desk. Don&apos;t print it on the court cards.</span>
        </div>
      </div>
      <p style={sub}>
        On game day, whoever keeps the book at each court scans the court card, types the PIN once, and presses Save final after each game. Standings, pool seats
        and the bracket update by themselves. Fix any score here by tapping its game.
      </p>
    </Section>
  );
}

const box: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 6, padding: "12px 14px", border: "1px solid var(--gw-border)", borderRadius: 12 };
const label: React.CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--gw-fg-muted)" };
