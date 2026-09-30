"use client";
// Pieces of a player's Directory card, shared by the Directory list and the
// player page: dates, the address line, a parent's block, the phone/email
// line, the requirement chips and the team picker.
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icons } from "../../../components/icons";
import { placePlayer } from "../../../../lib/teams/actions";
import { teamLabel } from "../../../../lib/teams/volunteer-options";
import type { DirectoryParent, DirectoryPlayer } from "./data";
import type { PlayerRequirement, Requirement } from "../../../../lib/requirements/types";
import { doneWord, requirementLabel, rowKey, stateFor } from "../../../../lib/requirements/logic";

export function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function playerAddress(p: Pick<DirectoryPlayer, "address_line1" | "address_line2" | "city" | "state" | "postal_code">): string | null {
  const cityLine = [p.city, [p.state, p.postal_code].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  return [p.address_line1, p.address_line2, cityLine].filter(Boolean).join(", ") || null;
}

export const RELATIONSHIP_LABEL: Record<DirectoryParent["relationship"], string> = {
  father: "Father",
  mother: "Mother",
  guardian: "Guardian",
};

export const muted: React.CSSProperties = { fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 500 };
const contactLink: React.CSSProperties = {
  color: "var(--gw-fg)",
  textDecoration: "none",
  overflowWrap: "anywhere",
};

// One chip per requirement that applies to the player: done (or paid),
// waived, or still needed. Tapping one opens the check-off.
export function RequirementChips({
  player,
  requirements,
  rows,
  onOpen,
}: {
  player: DirectoryPlayer;
  requirements: Requirement[];
  rows: Map<string, PlayerRequirement>;
  onOpen: (r: Requirement) => void;
}) {
  const chips = requirements
    .map((r) => ({ r, state: stateFor(player, r, rows), row: rows.get(rowKey(player.id, r.id)) }))
    .filter((c) => c.state !== "n/a");
  if (chips.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
      {chips.map(({ r, state, row }) => {
        const label = requirementLabel(r);
        const variant = state === "done" ? "rsd-chip-success" : state === "waived" ? "rsd-chip-mute" : "rsd-chip-error";
        const text =
          state === "done" ? label : state === "waived" ? `${label} waived` : r.kind === "fee" ? `Owes ${label}` : `Needs ${label}`;
        const title =
          state === "missing"
            ? `Mark ${r.name} for ${player.full_name}`
            : `${state === "done" ? doneWord(r.kind) : "Waived"}${row?.note ? ` · ${row.note}` : ""}${row?.file_path ? " · Scan attached" : ""}`;
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => onOpen(r)}
            data-tour="requirement-chip"
            className={`rsd-chip ${variant}`}
            title={title}
            style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}
          >
            {state === "done" && <Icons.CheckCircle width={11} height={11} />}
            {text}
            {row?.file_path && <Icons.FileText width={11} height={11} />}
          </button>
        );
      })}
    </div>
  );
}

export function ParentBlock({ parent, isStaff }: { parent: DirectoryParent; isStaff: boolean }) {
  const m = parent.member!;
  const name = m.full_name ?? m.email ?? "Unknown";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: "var(--gw-fg-muted)",
            textTransform: "uppercase",
            letterSpacing: ".06em",
            minWidth: 52,
          }}
        >
          {RELATIONSHIP_LABEL[parent.relationship]}
        </span>
        {/* A member's page is for approved members; staff can open anyone's. */}
        {m.status === "approved" || isStaff ? (
          <Link
            href={`/portal/directory/${m.id}`}
            prefetch={false}
            data-tour="directory-parent"
            style={{ fontSize: 13, fontWeight: 700, color: "var(--gw-fg)", textDecoration: "none" }}
          >
            {name}
          </Link>
        ) : (
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--gw-fg)" }}>{name}</span>
        )}
        {isStaff && !m.user_id && m.email && (
          <span className="rsd-chip rsd-chip-mute">Not signed up</span>
        )}
        {isStaff && m.user_id && m.status === "pending" && (
          <Link href="/portal/settings" prefetch={false} style={{ textDecoration: "none" }}>
            <span className="rsd-chip rsd-chip-warn">Awaiting approval</span>
          </Link>
        )}
      </div>
      <div style={{ paddingLeft: 60 }}>
        <ContactLine phone={m.phone} email={m.email} />
        {isStaff && m.volunteer_interests && (
          <div style={{ ...muted, marginTop: 2 }}>Can help: {m.volunteer_interests}</div>
        )}
      </div>
    </div>
  );
}

export function ContactLine({
  phone,
  email,
  label,
}: {
  phone: string | null;
  email: string | null;
  label?: string;
}) {
  if (!phone && !email) return null;
  return (
    <div style={{ ...muted, display: "flex", gap: "2px 12px", flexWrap: "wrap" }}>
      {label && <span>{label}:</span>}
      {phone && (
        <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} style={contactLink}>
          {phone}
        </a>
      )}
      {email && (
        <a href={`mailto:${email}`} style={contactLink}>
          {email}
        </a>
      )}
    </div>
  );
}

// Puts a player on a team, for the Registrations grant. Saves as soon as a
// team is picked; "No team yet" takes them off their team.
export function TeamPicker({
  player,
  teams,
}: {
  player: Pick<DirectoryPlayer, "id" | "full_name" | "team_id">;
  teams: { id: string; name: string; age_group: string | null }[];
}) {
  const router = useRouter();
  const [value, setValue] = useState(player.team_id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(teamId: string) {
    setValue(teamId);
    setBusy(true);
    setError(null);
    const res = await placePlayer(player.id, teamId || null);
    setBusy(false);
    if (res.error) {
      setError(res.error);
      setValue(player.team_id ?? "");
    } else router.refresh();
  }

  return (
    <div data-tour="directory-place" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
      <label
        htmlFor={`team-${player.id}`}
        style={{ fontSize: 10, fontWeight: 700, color: "var(--gw-fg-muted)", textTransform: "uppercase", letterSpacing: ".06em" }}
      >
        Team
      </label>
      <select
        id={`team-${player.id}`}
        value={value}
        onChange={(e) => change(e.target.value)}
        disabled={busy}
        style={{
          height: 32,
          padding: "0 10px",
          borderRadius: 8,
          border: "1px solid",
          borderColor: value ? "var(--gw-border)" : "var(--rsd-accent-line)",
          background: value ? "var(--gw-bg-elev)" : "var(--rsd-accent-bg)",
          color: "var(--gw-fg)",
          fontSize: 12,
          fontWeight: 600,
          cursor: busy ? "wait" : "pointer",
          maxWidth: "100%",
        }}
      >
        <option value="">No team yet</option>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {teamLabel(t)}
          </option>
        ))}
      </select>
      {busy && <span style={muted}>Saving…</span>}
      {error && (
        <span role="alert" style={{ fontSize: 12, fontWeight: 600, color: "var(--gw-error)" }}>
          {error}
        </span>
      )}
    </div>
  );
}
