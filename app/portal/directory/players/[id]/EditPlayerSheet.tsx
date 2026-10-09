"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Pill, Select, Textarea } from "../../../../components/ui";
import { moveOffRoster, updatePlayer, type OffRoster } from "../../../../../lib/teams/actions";
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
  // Remove from team…: open, and where they go.
  const [removing, setRemoving] = useState(false);
  const [to, setTo] = useState<OffRoster>("waitlisted");
  const [why, setWhy] = useState("");
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
    setBusy(true);
    setError(null);
    const res = await moveOffRoster(p.id, to, why);
    if (res.error) {
      setBusy(false);
      return setError(res.error);
    }
    router.push(`/portal/directory/registrations?tab=${to === "waitlisted" ? "waitlist" : "removed"}`);
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
        {removing ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, alignSelf: "stretch" }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: "var(--gw-fg)" }}>Where does {p.full_name.split(" ")[0]} go?</span>
            {(
              [
                ["waitlisted", "Waitlist", "Lost their spot (didn't show, stopped answering). They can be approved again when a spot opens."],
                ["rejected", "Withdrawn", "Not playing this season. They go on the Removed tab, so there's still a record."],
              ] as [OffRoster, string, string][]
            ).map(([value, label, help]) => (
              <label
                key={value}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: `1px solid ${to === value ? "var(--rsd-accent)" : "var(--gw-border)"}`,
                  background: to === value ? "var(--rsd-accent-bg)" : "var(--gw-bg)",
                  cursor: "pointer",
                }}
              >
                <input type="radio" name="off-roster" checked={to === value} onChange={() => setTo(value)} style={{ marginTop: 3 }} />
                <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--gw-fg)" }}>{label}</span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: "var(--gw-fg-muted)", lineHeight: 1.5 }}>{help}</span>
                </span>
              </label>
            ))}
            <Textarea
              label="Why (optional)"
              help="Shows on their registration. Families don't see it. For the full story, with screenshots, add a note on the player; it moves with them."
              value={why}
              maxLength={500}
              rows={2}
              onChange={(e) => setWhy(e.target.value)}
              placeholder={to === "waitlisted" ? "e.g. Didn't come to practice and didn't answer for two weeks." : "e.g. Moved away."}
            />
            <span style={{ fontSize: 12, fontWeight: 500, color: "var(--gw-fg-muted)", lineHeight: 1.5 }}>
              They leave their team and the Directory, with their notes. What they owe on Payments comes off. If the
              family has paid something, the Treasurer refunds it first. <strong>Approve</strong> brings them back.
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <Pill variant="dark" onClick={remove} disabled={busy}>
                {busy ? "Moving…" : to === "waitlisted" ? "Move to the waitlist" : "Mark withdrawn"}
              </Pill>
              <Pill variant="ghost" onClick={() => setRemoving(false)} disabled={busy}>
                Cancel
              </Pill>
            </div>
          </div>
        ) : (
          <>
            <span data-tour="player-remove" style={{ display: "inline-flex" }}>
              <Pill variant="light" onClick={() => setRemoving(true)} disabled={busy}>
                Remove from team…
              </Pill>
            </span>
            <span style={{ fontSize: 12, fontWeight: 500, color: "var(--gw-fg-muted)", lineHeight: 1.5 }}>
              Off the roster, to the Waitlist or as withdrawn. Nothing is deleted.
            </span>
          </>
        )}
      </div>
    </Sheet>
  );
}
