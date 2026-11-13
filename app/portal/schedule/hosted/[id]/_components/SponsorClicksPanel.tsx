// Sponsor clicks (0169), on the Money tab for the board: how many times
// people tapped each sponsor's logo on the live scores page and the
// website's Sponsors page, and went on to the sponsor's site.

import type { SponsorClickTotals } from "../../../../../../lib/sponsors/clicks";
import { Empty, Section, cap, sub } from "./parts";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function SponsorClicksPanel({ clicks }: { clicks: SponsorClickTotals[] | "migration" }) {
  const total = clicks === "migration" ? 0 : clicks.reduce((n, c) => n + c.clicks, 0);
  return (
    <Section
      title="Sponsor clicks"
      tour="hosted-sponsor-clicks"
      subtitle="Taps on each sponsor's logo that went on to their website, from the live scores page and the website's Sponsors page. Link previews and repeat taps within 10 minutes aren't counted."
    >
      {clicks === "migration" ? (
        <Empty>Not set up in the database yet: apply supabase/migrations/0169_sponsor_clicks.sql.</Empty>
      ) : total === 0 ? (
        <Empty>No clicks yet. They count from when this was turned on.</Empty>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead>
              <tr>
                {["Sponsor", "Clicks", "People", "Live scores", "Sponsors page", "Last click"].map((h, i) => (
                  <th key={h} style={{ ...cap, textAlign: i === 0 || i === 5 ? "left" : "right", padding: "6px 8px", borderBottom: "1px solid var(--gw-border)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {clicks.map((c) => (
                <tr key={c.slug}>
                  <td style={{ padding: "8px", fontWeight: 700, borderBottom: "1px solid var(--gw-border)" }}>{c.name}</td>
                  {[c.clicks, c.people, c.live, c.site].map((v, i) => (
                    <td key={i} style={{ padding: "8px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: i === 0 ? 800 : 500, borderBottom: "1px solid var(--gw-border)" }}>
                      {v}
                    </td>
                  ))}
                  <td style={{ padding: "8px", color: "var(--gw-fg-muted)", borderBottom: "1px solid var(--gw-border)", whiteSpace: "nowrap" }}>{c.lastAt ? when(c.lastAt) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p style={sub}>People counts different phones and computers, so one parent tapping three times is 3 clicks and 1 person.</p>
    </Section>
  );
}
