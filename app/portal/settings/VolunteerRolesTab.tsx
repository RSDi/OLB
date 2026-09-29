"use client";
// Settings → Volunteer Roles: the jobs every team can fill and how many of
// each a team needs. People are assigned to them on each team's Directory
// page.

import { useCallback, useEffect, useState } from "react";
import { Icons } from "../../components/icons";
import { Input, Pill, Select } from "../../components/ui";
import { createClient } from "../../../lib/supabase/client";
import {
  createVolunteerRole,
  deleteVolunteerRole,
  moveVolunteerRole,
  updateVolunteerRole,
} from "../../../lib/teams/volunteer-actions";
import type { OlbVolunteerRole, VolunteerRoleInput } from "../../../lib/teams/types";
import { VOLUNTEER_OPTIONS } from "../../../lib/teams/volunteer-options";
import { ErrorBox, IconBtn } from "./TeamsSettingsTab";

function toInput(r: OlbVolunteerRole): VolunteerRoleInput {
  return {
    name: r.name,
    description: r.description,
    spots_per_team: r.spots_per_team,
    is_leadership: r.is_leadership,
    show_in_directory: r.show_in_directory,
    registration_interest: r.registration_interest,
  };
}

async function fetchRoles(): Promise<{ rows: OlbVolunteerRole[]; error: string | null }> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("olb_volunteer_roles")
    .select("id, name, description, spots_per_team, is_leadership, show_in_directory, registration_interest, sort_order")
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  return { rows: (data as OlbVolunteerRole[] | null) ?? [], error: error?.message ?? null };
}

export function VolunteerRolesTab() {
  const [rows, setRows] = useState<OlbVolunteerRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((d: { rows: OlbVolunteerRole[]; error: string | null }) => {
    if (d.error) setError(d.error);
    else setRows(d.rows);
    setLoading(false);
  }, []);
  const load = useCallback(async () => apply(await fetchRoles()), [apply]);

  useEffect(() => {
    fetchRoles().then(apply);
  }, [apply]);

  async function run(id: string, action: () => Promise<{ error?: string }>) {
    setError(null);
    setActing(id);
    const res = await action();
    if (res.error) setError(res.error);
    else await load();
    setActing(null);
    return !res.error;
  }

  async function save(id: string | null, input: VolunteerRoleInput) {
    const ok = await run(id ?? "new", () => (id ? updateVolunteerRole(id, input) : createVolunteerRole(input)));
    if (ok) {
      setAdding(false);
      setEditingId(null);
    }
    return ok;
  }

  function remove(r: OlbVolunteerRole) {
    if (!confirm(`Delete "${r.name}"? It comes off every team, along with the people in it.`)) return;
    run(r.id, () => deleteVolunteerRole(r.id));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500, maxWidth: 600 }}>
          The jobs every team can fill. Set how many of each a team needs, then assign anyone (a parent,
          a coach&apos;s spouse, any member) from the team&apos;s page in the Directory.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {!adding && (
            <span data-tour="roles-add" style={{ display: "inline-flex" }}>
              <Pill variant="accent" size="sm" onClick={() => setAdding(true)}>
                <Icons.Plus width={14} height={14} /> Add role
              </Pill>
            </span>
          )}
        </div>
      </div>

      {error && <ErrorBox text={error} />}

      {adding && <RoleForm submitLabel="Add role" onCancel={() => setAdding(false)} onSubmit={(v) => save(null, v)} />}

      {loading ? (
        <div style={{ padding: "40px 0", textAlign: "center", color: "var(--gw-fg-muted)", fontSize: 13 }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div className="rsd-card" style={{ textAlign: "center", padding: "40px 24px" }}>
          <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>No volunteer roles yet.</div>
        </div>
      ) : (
        <div className="rsd-card" style={{ padding: 0, gap: 0, overflowX: "auto" }}>
          <div style={{ ...grid, borderTop: "none", paddingTop: 12, paddingBottom: 10 }}>
            <span style={cap}>Order</span>
            <span style={cap}>Role</span>
            <span style={cap}>Spots per team</span>
            <span style={cap}>Leadership</span>
            <span style={cap}>In Directory</span>
            <span />
          </div>
          {rows.map((r, i) =>
            editingId === r.id ? (
              <div key={r.id} style={{ padding: 12, borderTop: "1px solid var(--gw-border)" }}>
                <RoleForm initial={r} submitLabel="Save" onCancel={() => setEditingId(null)} onSubmit={(v) => save(r.id, v)} />
              </div>
            ) : (
              <div key={r.id} data-tour="roles-row" style={{ ...grid, opacity: acting === r.id ? 0.5 : 1 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <OrderBtn label={`Move ${r.name} up`} disabled={i === 0 || !!acting} onClick={() => run(r.id, () => moveVolunteerRole(r.id, "up"))}>
                    <Icons.ChevronUp width={13} height={13} />
                  </OrderBtn>
                  <OrderBtn
                    label={`Move ${r.name} down`}
                    disabled={i === rows.length - 1 || !!acting}
                    onClick={() => run(r.id, () => moveVolunteerRole(r.id, "down"))}
                  >
                    <Icons.ChevronDown width={13} height={13} />
                  </OrderBtn>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                  <span style={{ fontSize: 14, fontWeight: 800 }}>{r.name}</span>
                  {r.description && <span style={{ fontSize: 12, fontWeight: 500, color: "var(--gw-fg-muted)" }}>{r.description}</span>}
                  {r.registration_interest && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: "var(--gw-fg-muted)" }}>
                      Suggests people who signed up for “{r.registration_interest}”
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <StepBtn
                    label={`Fewer ${r.name} spots`}
                    disabled={r.spots_per_team <= 1 || !!acting}
                    onClick={() => run(r.id, () => updateVolunteerRole(r.id, { ...toInput(r), spots_per_team: r.spots_per_team - 1 }))}
                  >
                    −
                  </StepBtn>
                  <span style={{ fontSize: 15, fontWeight: 800, minWidth: 16, textAlign: "center" }}>{r.spots_per_team}</span>
                  <StepBtn
                    label={`More ${r.name} spots`}
                    disabled={r.spots_per_team >= 10 || !!acting}
                    onClick={() => run(r.id, () => updateVolunteerRole(r.id, { ...toInput(r), spots_per_team: r.spots_per_team + 1 }))}
                  >
                    +
                  </StepBtn>
                </div>
                <Switch
                  label={`${r.name}: leadership`}
                  on={r.is_leadership}
                  disabled={!!acting}
                  onClick={() => run(r.id, () => updateVolunteerRole(r.id, { ...toInput(r), is_leadership: !r.is_leadership }))}
                />
                <Switch
                  label={`${r.name}: show in Directory`}
                  on={r.show_in_directory}
                  disabled={!!acting}
                  onClick={() => run(r.id, () => updateVolunteerRole(r.id, { ...toInput(r), show_in_directory: !r.show_in_directory }))}
                />
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <IconBtn title="Edit" disabled={!!acting} onClick={() => setEditingId(r.id)}>
                    <Icons.Pencil width={14} height={14} />
                  </IconBtn>
                  <IconBtn title="Delete" danger disabled={!!acting} onClick={() => remove(r)}>
                    <Icons.Trash width={14} height={14} />
                  </IconBtn>
                </div>
              </div>
            )
          )}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
        <Legend tag="Leadership">
          People in these roles can switch the Directory to age groups (10U–18U), like the board does.
        </Legend>
        <Legend tag="In Directory">
          Shown on the team&apos;s banner when someone filters the Directory by team. Every role shows on the
          team&apos;s own page.
        </Legend>
      </div>
    </div>
  );
}

function RoleForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: OlbVolunteerRole;
  submitLabel: string;
  onSubmit: (v: VolunteerRoleInput) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [spots, setSpots] = useState(String(initial?.spots_per_team ?? 1));
  const [lead, setLead] = useState(initial?.is_leadership ?? false);
  const [show, setShow] = useState(initial?.show_in_directory ?? false);
  const [interest, setInterest] = useState(initial?.registration_interest ?? "");
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return;
    setPending(true);
    await onSubmit({
      name,
      description,
      spots_per_team: Number(spots) || 1,
      is_leadership: lead,
      show_in_directory: show,
      registration_interest: interest || null,
    });
    setPending(false);
  }

  return (
    <form onSubmit={submit} data-tour="roles-form" className="rsd-card" style={{ gap: 14, padding: "16px 18px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        <Input label="Role name *" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Video" autoFocus required />
        <Input label="What they do" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Films games" />
        <Input label="Spots per team" type="number" min={1} max={10} value={spots} onChange={(e) => setSpots(e.target.value)} />
        <Select
          label="Registration answer"
          value={interest}
          onChange={(e) => setInterest(e.target.value)}
          help="People who picked this on their registration are suggested first."
        >
          <option value="">None</option>
          {VOLUNTEER_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      </div>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        <label style={checkLabel}>
          <input type="checkbox" checked={lead} onChange={(e) => setLead(e.target.checked)} />
          Leadership (sees age groups in the Directory)
        </label>
        <label style={checkLabel}>
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
          Show on the team&apos;s Directory banner
        </label>
      </div>
      <div data-tour="roles-save" style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Pill variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          Cancel
        </Pill>
        <Pill variant="accent" size="sm" type="submit" disabled={pending || !name.trim()}>
          {pending ? "Saving…" : submitLabel}
        </Pill>
      </div>
    </form>
  );
}

function Switch({ label, on, disabled, onClick }: { label: string; on: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 42,
        height: 24,
        borderRadius: 100,
        border: "none",
        padding: 0,
        position: "relative",
        cursor: disabled ? "default" : "pointer",
        background: on ? "var(--gw-fg)" : "var(--gw-border)",
        transition: "background 150ms",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: on ? 21 : 3,
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: on ? "var(--rsd-accent-fill)" : "var(--gw-bg-elev)",
          boxShadow: "0 1px 2px rgba(0,0,0,.2)",
          transition: "left 150ms",
        }}
      />
    </button>
  );
}

function StepBtn({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 30,
        height: 30,
        borderRadius: 8,
        border: "1px solid var(--gw-border)",
        background: "var(--gw-bg-elev)",
        color: "var(--gw-fg)",
        fontSize: 15,
        fontWeight: 800,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {children}
    </button>
  );
}

function OrderBtn({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 26,
        height: 20,
        borderRadius: 6,
        border: "none",
        background: "transparent",
        color: "var(--gw-fg-muted)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.3 : 1,
        padding: 0,
      }}
    >
      {children}
    </button>
  );
}

function Legend({ tag, children }: { tag: string; children: React.ReactNode }) {
  return (
    <div className="rsd-card" style={{ flexDirection: "row", gap: 12, alignItems: "flex-start", padding: "14px 16px" }}>
      <span className="rsd-chip rsd-chip-accent" style={{ fontSize: 10, flexShrink: 0 }}>
        {tag}
      </span>
      <span style={{ fontSize: 12, fontWeight: 500, color: "var(--gw-fg-muted)", lineHeight: 1.5 }}>{children}</span>
    </div>
  );
}

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "40px minmax(180px, 2.2fr) 130px 100px 100px 84px",
  gap: 16,
  alignItems: "center",
  padding: "12px 18px",
  borderTop: "1px solid var(--gw-border)",
  minWidth: 680,
};

const cap: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: ".1em",
  textTransform: "uppercase",
  color: "var(--gw-fg-muted)",
};

const checkLabel: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  fontSize: 13,
  fontWeight: 600,
  color: "var(--gw-fg)",
};
