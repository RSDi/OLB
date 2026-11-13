"use client";
// Settings → Coach Cory !: the count on the public page at /! of how many
// exclamation points Coach Cory has used in Slack (lib/fun/cory.ts). Saved
// straight to site_content, which the Website grant can change; the public
// page reads it fresh on every visit.

import { useCallback, useEffect, useState } from "react";
import { createClient } from "../../../lib/supabase/client";
import { Input, Pill } from "../../components/ui";
import { ErrorBox } from "./TeamsSettingsTab";
import { CORY_KEY, CORY_MAX, coryCountFromInput, parseCoryCount } from "../../../lib/fun/cory";

const card: React.CSSProperties = { gap: 14, padding: "16px 18px" };
const sub: React.CSSProperties = { fontSize: 12.5, color: "var(--gw-fg-muted)", fontWeight: 500, lineHeight: 1.5, margin: 0 };

export function CoryTab() {
  const [count, setCount] = useState<number | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: err } = await createClient().from("site_content").select("value").eq("key", CORY_KEY).maybeSingle();
    if (err) return setError(err.message);
    const n = parseCoryCount((data as { value: string } | null)?.value);
    setCount(n);
    setTyped(String(n));
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads once on mount
    load();
  }, [load]);

  async function save(next: number) {
    if (next < 0 || next > CORY_MAX) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error: err } = await supabase
      .from("site_content")
      .upsert({ key: CORY_KEY, value: String(next), updated_at: new Date().toISOString(), updated_by: user?.id ?? null });
    setBusy(false);
    if (err) return setError(err.message);
    setCount(next);
    setTyped(String(next));
  }

  if (error && count === null) return <ErrorBox text={error} />;
  if (count === null) return <div style={{ padding: "40px 0", textAlign: "center", color: "var(--gw-fg-muted)", fontSize: 13 }}>Loading…</div>;

  const typedCount = coryCountFromInput(typed);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 640 }}>
      <p style={{ ...sub, fontSize: 13 }}>
        How many exclamation points Coach Cory has used in Slack. Anyone can see it at{" "}
        <a href="/!" target="_blank" rel="noreferrer" style={{ color: "var(--gw-fg)", fontWeight: 700 }}>
          omahalightningbasketball.com/!
        </a>
        .
      </p>
      {error && <ErrorBox text={error} />}

      <div className="rsd-card" style={{ ...card, display: "flex", flexDirection: "column" }} data-tour="cory-count">
        <div style={{ fontFamily: "var(--rsd-display)", fontSize: 72, fontWeight: 800, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
          {count.toLocaleString("en-US")}!
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Pill size="sm" variant="accent" disabled={busy} onClick={() => save(count + 1)}>
            +1
          </Pill>
          <Pill size="sm" disabled={busy} onClick={() => save(count + 5)}>
            +5
          </Pill>
          <Pill size="sm" disabled={busy} onClick={() => save(count + 10)}>
            +10
          </Pill>
          <Pill size="sm" variant="ghost" disabled={busy || count === 0} onClick={() => save(count - 1)}>
            −1
          </Pill>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
          <Input
            label="Set the count"
            inputMode="numeric"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            error={typed.trim() && typedCount === null ? "A whole number, 0 or more." : undefined}
          />
          <Pill size="sm" variant="dark" disabled={busy || typedCount === null || typedCount === count} onClick={() => typedCount !== null && save(typedCount)}>
            {busy ? "Saving…" : "Save"}
          </Pill>
        </div>
      </div>
    </div>
  );
}
