"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { SettingsLink } from "../../../components/SettingsLink";
import { Pill } from "../../../components/ui";
import { ErrorNote } from "../../payments/parts";
import { muted } from "../_shared/PlayerParts";
import { addToSlackChannels } from "../../../../lib/onboarding/slack-channel-actions";
import type { SlackPanel } from "../../../../lib/onboarding/board-data";

// Slack channels for new families (0175), on the Onboarding tab: approved
// families whose parents aren't in all their channels yet, with "Add to
// Slack channels" for one family or everyone.
export function SlackChannelsPanel({ panel }: { panel: SlackPanel }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ error?: string; notice?: string } | null>(null);

  async function add(familyId?: string) {
    setBusy(familyId ?? "all");
    setMessage(null);
    const res = await addToSlackChannels(familyId);
    setBusy(null);
    setMessage(res);
    router.refresh();
  }

  if (!panel.configured) {
    return (
      <div className="rsd-card" data-tour="onboarding-slack" style={{ padding: "14px 16px", gap: 6 }}>
        <div style={{ fontSize: 13.5, fontWeight: 800 }}>Slack channels</div>
        <div style={muted}>
          Pick the channels every family joins, and each team&apos;s channel, in{" "}
          <SettingsLink tab="registration_automations">Settings → Registration Automations</SettingsLink>.
        </div>
      </div>
    );
  }

  return (
    <div className="rsd-card" data-tour="onboarding-slack" style={{ padding: 0, gap: 0, overflow: "hidden" }}>
      <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800 }}>
            Slack channels · {panel.families.length} to go{panel.done ? `, ${panel.done} done` : ""}
          </div>
          <div style={muted}>
            {panel.auto
              ? "Parents are added every morning once they join Slack. Add them now with the button."
              : "Adding on its own is off. Press Add to Slack channels, or turn it on in Settings."}
          </div>
        </div>
        {panel.families.length > 1 && (
          <Pill size="sm" variant="ghost" onClick={() => add()} disabled={busy !== null}>
            {busy === "all" ? "Adding…" : "Add everyone"}
          </Pill>
        )}
      </div>
      {message?.error && (
        <div style={{ padding: "0 16px 12px" }}>
          <ErrorNote text={message.error} />
        </div>
      )}
      {message?.notice && <div style={{ ...muted, padding: "0 16px 12px", fontWeight: 700, color: "var(--gw-fg)" }}>{message.notice}</div>}
      {panel.families.map((f) => (
        <div key={f.id} style={{ borderTop: "1px solid var(--gw-border)", padding: "10px 16px", display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 260px", minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{f.title}</div>
            {f.people.map((p) => (
              <div key={p.email} style={{ ...muted, fontSize: 12, overflowWrap: "anywhere" }}>
                {!p.joined ? (
                  <>{p.email} hasn&apos;t joined Slack yet. They&apos;re added once they do.</>
                ) : p.missing.length === 0 ? (
                  <>
                    {p.email}: in {p.added.map((c) => `#${c}`).join(", ")}
                  </>
                ) : (
                  <>
                    {p.email}: not in {p.missing.map((c) => `#${c}`).join(", ")} yet
                    {p.error && <span style={{ display: "block", color: "var(--gw-error)" }}>{p.error}</span>}
                  </>
                )}
              </div>
            ))}
          </div>
          <Pill size="sm" variant="dark" onClick={() => add(f.id)} disabled={busy !== null}>
            {busy === f.id ? "Adding…" : "Add to Slack channels"}
          </Pill>
        </div>
      ))}
      {panel.families.length === 0 && <div style={{ ...muted, borderTop: "1px solid var(--gw-border)", padding: "10px 16px" }}>Every approved family on Slack is in their channels.</div>}
    </div>
  );
}
