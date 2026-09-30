"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Pill, Select } from "../../../../components/ui";
import { removePlayer, updatePlayer } from "../../../../../lib/teams/actions";
import { AGE_GROUPS } from "../../../../../lib/teams/volunteer-options";
import type { DirectoryPlayer } from "../../_shared/data";
import { ErrorNote, Sheet } from "../../../payments/parts";

// Edit player, for the Registrations grant: the player's name, birthday,
// jersey number and age group, and taking them off the roster. The team is
// picked on the player's card.
export function EditPlayerSheet({ player: p, onClose }: { player: DirectoryPlayer; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(p.full_name);
  const [dob, setDob] = useState(p.dob ?? "");
  const [jersey, setJersey] = useState(p.jersey_number ?? "");
  const [ageGroup, setAgeGroup] = useState(p.age_group ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const groups = p.age_group && !AGE_GROUPS.includes(p.age_group) ? [p.age_group, ...AGE_GROUPS] : AGE_GROUPS;

  async function save() {
    setBusy(true);
    setError(null);
    const res = await updatePlayer(p.id, { full_name: name, dob: dob || null, jersey_number: jersey || null, age_group: ageGroup || null });
    setBusy(false);
    if (res.error) return setError(res.error);
    router.refresh();
    onClose();
  }

  async function remove() {
    if (!confirm(`Take ${p.full_name} off the roster? They leave the Directory and their team, and their parents stay as members.`)) return;
    setBusy(true);
    setError(null);
    const res = await removePlayer(p.id);
    if (res.error) {
      setBusy(false);
      return setError(res.error);
    }
    router.push("/portal/directory");
  }

  return (
    <Sheet eyebrow={p.full_name} title="Edit player" busy={busy} onClose={onClose}>
      <Input label="Name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} autoFocus />
      <Input label="Birthday" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
        <Input
          label="Jersey number"
          inputMode="numeric"
          value={jersey}
          maxLength={3}
          onChange={(e) => setJersey(e.target.value)}
          placeholder="None"
        />
        <Select label="Age group" value={ageGroup} onChange={(e) => setAgeGroup(e.target.value)}>
          <option value="">None</option>
          {groups.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </Select>
      </div>

      {error && <ErrorNote text={error} />}

      <div style={{ display: "flex", gap: 8 }}>
        <Pill variant="accent" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Pill>
        <Pill variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Pill>
      </div>

      <div
        style={{
          marginTop: "auto",
          paddingTop: 16,
          borderTop: "1px solid var(--gw-border)",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          alignItems: "flex-start",
        }}
      >
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          data-tour="player-remove"
          className="gw-press"
          style={{
            border: "1px solid var(--gw-error)",
            background: "var(--gw-error-bg)",
            color: "var(--gw-error)",
            borderRadius: 100,
            padding: "8px 14px",
            fontSize: 12,
            fontWeight: 700,
            cursor: busy ? "wait" : "pointer",
          }}
        >
          Take off the roster
        </button>
        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--gw-fg-muted)", lineHeight: 1.5 }}>
          For a player who isn&apos;t in the program this season. A player with charges or payments on the Payments page
          stays until the Treasurer voids them.
        </span>
      </div>
    </Sheet>
  );
}
