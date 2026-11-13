"use client";
// Live scores (0165), at the top of the Brackets tab: turn the public page
// (/shootout) on, make the PIN for the scorer's tables, and print the signs
// with the QR code. Jeff-only until it's released.

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
          {/* A PDF, so a plain link: one sign per Letter page, ready to print. */}
          <a href={`/shootout/signs?w=${weekend.id}`} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 700, alignSelf: "center" }}>
            Print the signs
          </a>
        </>
      }
    >
      <Said error={error} notice={notice} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        <div style={box}>
          <span style={label}>Live page</span>
          <a href="/shootout" target="_blank" rel="noreferrer" style={{ fontWeight: 800, fontSize: 15, overflowWrap: "anywhere" }}>
            omahalightningbasketball.com/shootout
          </a>
          <span style={sub}>The address on the QR signs. It refreshes itself every 30 seconds.</span>
        </div>
        <div style={box}>
          <span style={label}>TV screens</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <TvLink name="Scoreboard" path="/shootout/tv" />
            <TvLink name="Admission" path="/shootout/tv/admission" />
          </div>
          <span style={sub}>
            Open one in the TV&apos;s browser (a Fire Stick&apos;s Silk works) and press OK for full screen. The scoreboard turns through the courts and divisions;
            /shootout/tv/courts or /shootout/tv/{data.divisions[0] ? tvSlug(data.divisions[0]) : "hsa"} stays on one. Admission shows the prices from Details, even
            with the live page off.
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
        On game day, the scorer&apos;s table opens omahalightningbasketball.com/shootout/score (or scans any court card) and types the PIN once. Every game on every
        court is there: Score, Fix, and Edit game to move a game or pick its teams. Standings, pool seats and the bracket update by themselves. Fix any score here
        by tapping its game too.
      </p>
    </Section>
  );
}

// "Scoreboard  /shootout/tv": the name, then the short address it opens.
function TvLink({ name, path }: { name: string; path: string }) {
  return (
    <a
      href={path}
      target="_blank"
      rel="noreferrer"
      style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap", textDecoration: "none", color: "inherit" }}
    >
      <b style={{ fontSize: 14, fontWeight: 800, minWidth: 84 }}>{name}</b>
      <span style={{ fontSize: 13, fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 3, overflowWrap: "anywhere" }}>{path}</span>
    </a>
  );
}

const box: React.CSSProperties = { minWidth: 0, display: "flex", flexDirection: "column", gap: 6, padding: "12px 14px", border: "1px solid var(--gw-border)", borderRadius: 12 };
const label: React.CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--gw-fg-muted)" };
