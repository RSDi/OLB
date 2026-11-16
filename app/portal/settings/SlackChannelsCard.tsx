"use client";
import { useCallback, useEffect, useState } from "react";
import { SettingsLink } from "../../components/SettingsLink";
import { Input, Pill } from "../../components/ui";
import { ErrorBox } from "./TeamsSettingsTab";
import { loadSlackChannelsCard, saveSlackChannels, type SlackChannelsCard as Card } from "../../../lib/onboarding/slack-channel-actions";

const sub: React.CSSProperties = { fontSize: 12.5, color: "var(--gw-fg-muted)", fontWeight: 500, lineHeight: 1.5, margin: 0 };

// Settings → Registration Automations: "Slack channels for new families"
// (0175). The switch, the channels every family joins, and each team's
// channel. Preview accounts only for now.
export function SlackChannelsCard() {
  const [card, setCard] = useState<Card | null>(null);
  const [auto, setAuto] = useState(false);
  const [everyone, setEveryone] = useState<string[]>([]);
  const [teams, setTeams] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const apply = useCallback((res: Awaited<ReturnType<typeof loadSlackChannelsCard>>) => {
    if ("error" in res) return setError(res.error);
    setCard(res);
    setAuto(res.auto);
    setEveryone(res.everyone.length ? res.everyone.map((c) => c.id) : [""]);
    setTeams(Object.fromEntries(res.teams.map((t) => [t.id, t.channel])));
  }, []);
  useEffect(() => {
    let cancelled = false;
    loadSlackChannelsCard().then((res) => {
      if (!cancelled) apply(res);
    });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  if (!card?.preview) return null;
  const nameOf = (id: string) => card.everyone.find((c) => c.id === id)?.name;

  async function save() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const res = await saveSlackChannels({ auto, everyone, teams: Object.entries(teams).map(([id, channel]) => ({ id, channel })) });
    if (res.error) {
      setBusy(false);
      return setError(res.error);
    }
    apply(await loadSlackChannelsCard());
    setBusy(false);
    setNotice("Saved.");
  }

  return (
    <div className="rsd-card" style={{ gap: 14, padding: "16px 18px" }} data-tour="automations-slack-channels">
      <h3 style={{ fontSize: 14, fontWeight: 800, margin: 0 }}>
        Slack channels for new families <span className="rsd-chip rsd-chip-accent">Preview</span>
      </h3>
      <p style={sub}>
        Once a parent of an approved family joins Slack, the club&apos;s Slack app adds them to their team&apos;s channel and the channels
        below. The Onboarding tab shows who&apos;s in and has an Add to Slack channels button.
      </p>
      {!card.slackConnected && <ErrorBox text="Slack isn't connected on this site, so nobody can be added yet." />}
      <label style={{ display: "flex", gap: 12, alignItems: "flex-start", cursor: "pointer" }}>
        <input type="checkbox" role="switch" checked={auto} onChange={(e) => setAuto(e.target.checked)} style={{ width: 18, height: 18, marginTop: 2, accentColor: "var(--rsd-accent)" }} />
        <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 13.5, fontWeight: 700 }}>Add parents on their own</span>
          <span style={sub}>Every morning at 9. Off: only when someone presses Add to Slack channels.</span>
        </span>
      </label>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Every family joins</div>
        {everyone.map((v, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <Input
                label={nameOf(v) ? `#${nameOf(v)}` : `Channel ${i + 1}`}
                help={i === 0 ? "In Slack, open the channel, click its name, and copy the link at the bottom. Paste it here." : undefined}
                value={v}
                onChange={(e) => setEveryone(everyone.map((x, j) => (j === i ? e.target.value : x)))}
                placeholder="https://….slack.com/archives/C0123456789"
              />
            </div>
            <Pill size="sm" variant="ghost" onClick={() => setEveryone(everyone.length > 1 ? everyone.filter((_, j) => j !== i) : [""])}>
              Remove
            </Pill>
          </div>
        ))}
        <div>
          <Pill size="sm" variant="ghost" onClick={() => setEveryone([...everyone, ""])}>
            Add a channel
          </Pill>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Each team&apos;s channel</div>
        <p style={sub}>Blank uses the team&apos;s channel from <SettingsLink tab="film">Settings → Film</SettingsLink>, if it has one. A private channel needs the club&apos;s Slack app added to it first.</p>
        {card.teams.length === 0 && <p style={sub}>No teams on this season&apos;s board yet.</p>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: 10 }}>
          {card.teams.map((t) => (
            <Input
              key={t.id}
              label={t.name}
              value={teams[t.id] ?? ""}
              onChange={(e) => setTeams({ ...teams, [t.id]: e.target.value })}
              placeholder={t.filmChannel ? `Film channel: ${t.filmChannel}` : "Channel link or ID"}
            />
          ))}
        </div>
      </div>

      {error && <ErrorBox text={error} />}
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <Pill variant="accent" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save Slack channels"}
        </Pill>
        {notice && <span style={{ ...sub, fontWeight: 700, color: "var(--gw-fg)" }}>{notice}</span>}
      </div>
    </div>
  );
}
