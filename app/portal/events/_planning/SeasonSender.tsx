"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pill, Select } from "../../../components/ui";
import { sendSeasonToReview } from "../../../../lib/planning/actions";
import { seasonLabel } from "../../../../lib/planning/season";

// "Send 2026–27 to Review": copies the template's monthly tasks into a
// season, where the board keeps or tosses each one. Safe to press again; it
// only adds what the season doesn't have yet.
export function SeasonSender({
  seasons,
  initial,
  built,
}: {
  seasons: number[];
  initial: number;
  // Seasons already sent at least once (pressing again adds new template lines).
  built: number[];
}) {
  const router = useRouter();
  const [season, setSeason] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const again = built.includes(season);

  function send() {
    setMessage(null);
    startTransition(async () => {
      const res = await sendSeasonToReview(season);
      if (res.error) {
        setMessage({ ok: false, text: res.error });
        return;
      }
      const n = res.created ?? 0;
      if (n === 0) {
        setMessage({ ok: true, text: `${seasonLabel(season)} already has everything in the template.` });
        router.refresh();
        return;
      }
      router.push(`/portal/events?view=review&season=${season}`);
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
        {seasons.length > 1 && (
          <div style={{ minWidth: 150 }}>
            <Select
              label="Season"
              value={String(season)}
              onChange={(e) => setSeason(Number(e.target.value))}
              help="A season runs August through July."
            >
              {seasons.map((s) => (
                <option key={s} value={s}>
                  {seasonLabel(s)}
                </option>
              ))}
            </Select>
          </div>
        )}
        <Pill variant="accent" onClick={send} disabled={pending}>
          {pending
            ? "Sending…"
            : again
              ? `Add new template items to ${seasonLabel(season)}`
              : `Send ${seasonLabel(season)} to Review`}
        </Pill>
      </div>
      {message && (
        <div style={{ fontSize: 13, fontWeight: 600, color: message.ok ? "var(--gw-fg-muted)" : "var(--gw-error)" }}>
          {message.text}
        </div>
      )}
    </div>
  );
}
