"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "../../components/icons";
import { Input, Pill, Select, Textarea } from "../../components/ui";
import { createClient } from "../../../lib/supabase/client";
import { canDeleteSettings, type MemberLike } from "../../../lib/auth/permissions";
import {
  createRequirement,
  deleteRequirement,
  moveRequirement,
  updateRequirement,
  type RequirementResult,
} from "../../../lib/requirements/actions";
import { formatAmount, type RequirementInput } from "../../../lib/requirements/logic";
import {
  REQUIREMENT_COLUMNS,
  REQUIREMENT_NAME_MAX,
  type Requirement,
  type RequirementKind,
} from "../../../lib/requirements/types";
import { teamLabel } from "../../../lib/teams/volunteer-options";
import { ErrorBox, IconBtn } from "./TeamsSettingsTab";
import { useTour } from "../../components/GuidedTour";
import { REQUIREMENTS_TOUR_ID } from "../../../lib/help/tours";

interface TeamOption {
  id: string;
  name: string;
  age_group: string | null;
}

interface RequirementsData {
  rows: Requirement[];
  teams: TeamOption[];
  error: string | null;
}

async function fetchRequirements(): Promise<RequirementsData> {
  const supabase = createClient();
  const { data: board } = await supabase
    .from("olb_boards")
    .select("id")
    .order("season", { ascending: false })
    .limit(1)
    .maybeSingle();
  const [{ data, error }, { data: teams }] = await Promise.all([
    supabase
      .from("olb_requirements")
      .select(REQUIREMENT_COLUMNS)
      .is("deleted_at", null)
      .order("sort_order")
      .order("name"),
    board
      ? supabase
          .from("olb_teams")
          .select("id, name, age_group")
          .eq("board_id", board.id)
          .order("sort_order")
          .order("name")
      : Promise.resolve({ data: [] }),
  ]);
  return {
    rows: (data as Requirement[] | null) ?? [],
    teams: (teams as TeamOption[] | null) ?? [],
    error: error?.message ?? null,
  };
}

function formatDue(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function toInput(r: Requirement): RequirementInput {
  return {
    name: r.name,
    description: r.description ?? "",
    kind: r.kind,
    amount: r.amount_cents != null ? (r.amount_cents / 100).toFixed(2) : "",
    allowFile: r.allow_file,
    dueOn: r.due_on ?? "",
    teamIds: r.team_ids,
    active: r.active,
  };
}

// Settings → Requirements: what every player has to hand in or pay — the
// handbook signature, a tournament fee — tracked per player in the Directory.
// Super-admins and board members with the settings grants.
export function RequirementsTab({ me }: { me: MemberLike }) {
  const router = useRouter();
  const { start: startTour } = useTour();
  const canDelete = canDeleteSettings(me);
  const [rows, setRows] = useState<Requirement[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((d: RequirementsData) => {
    if (d.error) setError(d.error);
    else setRows(d.rows);
    setTeams(d.teams);
    setLoading(false);
  }, []);

  const load = useCallback(async () => apply(await fetchRequirements()), [apply]);

  useEffect(() => {
    let cancelled = false;
    fetchRequirements().then((d) => {
      if (!cancelled) apply(d);
    });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  // Runs an action, then reloads the list. False on error.
  async function run(id: string, action: () => Promise<RequirementResult>): Promise<boolean> {
    setError(null);
    setActing(id);
    const result = await action();
    setActing(null);
    if (result.error) {
      setError(result.error);
      return false;
    }
    await load();
    router.refresh();
    return true;
  }

  async function handleAdd(values: RequirementInput) {
    if (await run("new", () => createRequirement(values))) setAdding(false);
  }

  async function handleUpdate(id: string, values: RequirementInput) {
    if (await run(id, () => updateRequirement(id, values))) setEditingId(null);
  }

  async function handleDelete(r: Requirement) {
    if (!confirm(`Delete "${r.name}"? It's removed from Settings and the Directory. To hide it but keep it for later, untick Active instead.`)) return;
    await run(r.id, () => deleteRequirement(r.id));
  }

  const teamName = (id: string) => {
    const t = teams.find((x) => x.id === id);
    return t ? teamLabel(t) : null;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500, maxWidth: 540 }}>
          What players need to hand in or pay — the handbook signature page, a tournament fee, a form. The board
          checks players off in the Directory and can filter it to see who&apos;s still missing each one.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Pill variant="ghost" size="sm" onClick={() => startTour(REQUIREMENTS_TOUR_ID)}>
            Show me how
          </Pill>
          {!adding && (
            <span data-tour="requirements-add" style={{ display: "inline-flex" }}>
              <Pill variant="accent" size="sm" onClick={() => { setAdding(true); setError(null); }}>
                <Icons.Plus width={14} height={14} /> Add requirement
              </Pill>
            </span>
          )}
        </div>
      </div>

      {error && <ErrorBox text={error} />}

      {adding && (
        <RequirementForm
          teams={teams}
          submitLabel="Add requirement"
          onCancel={() => { setAdding(false); setError(null); }}
          onSubmit={handleAdd}
        />
      )}

      {loading ? (
        <div style={{ padding: "40px 0", textAlign: "center", color: "var(--gw-fg-muted)", fontSize: 13 }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div className="rsd-card" style={{ textAlign: "center", padding: "40px 24px" }}>
          <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>No requirements yet.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map((r, i) => {
            if (editingId === r.id) {
              return (
                <RequirementForm
                  key={r.id}
                  teams={teams}
                  initial={toInput(r)}
                  submitLabel="Save"
                  onCancel={() => { setEditingId(null); setError(null); }}
                  onSubmit={(values) => handleUpdate(r.id, values)}
                />
              );
            }
            const scope = r.team_ids?.length
              ? r.team_ids.map(teamName).filter(Boolean).join(", ") || "Teams from an earlier season"
              : "All players";
            const facts = [
              r.kind === "fee" ? `Fee${r.amount_cents != null ? ` · ${formatAmount(r.amount_cents)}` : ""}` : "Task / form",
              scope,
              r.due_on && `Due ${formatDue(r.due_on)}`,
              r.allow_file && "Scan upload",
            ].filter(Boolean);
            return (
              <div
                key={r.id}
                className="rsd-card"
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 14,
                  padding: "12px 18px",
                  opacity: acting === r.id ? 0.5 : 1,
                  transition: "opacity 150ms",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
                  <OrderBtn
                    label={`Move ${r.name} up`}
                    disabled={i === 0 || !!acting}
                    onClick={() => run(r.id, () => moveRequirement(r.id, "up"))}
                  >
                    <Icons.ChevronUp width={13} height={13} />
                  </OrderBtn>
                  <OrderBtn
                    label={`Move ${r.name} down`}
                    disabled={i === rows.length - 1 || !!acting}
                    onClick={() => run(r.id, () => moveRequirement(r.id, "down"))}
                  >
                    <Icons.ChevronDown width={13} height={13} />
                  </OrderBtn>
                </div>
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14, fontWeight: 800 }}>{r.name}</span>
                    {!r.active && <span className="rsd-chip rsd-chip-mute">Retired</span>}
                  </div>
                  {r.description && (
                    <span style={{ fontSize: 12, fontWeight: 500, color: "var(--gw-fg-muted)" }}>{r.description}</span>
                  )}
                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--gw-fg-muted)" }}>{facts.join(" · ")}</span>
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <IconBtn
                    onClick={() => { setEditingId(r.id); setError(null); }}
                    disabled={!!acting}
                    title="Edit"
                  >
                    <Icons.Pencil width={14} height={14} />
                  </IconBtn>
                  {canDelete && (
                    <IconBtn onClick={() => handleDelete(r)} disabled={!!acting} title="Delete" danger>
                      <Icons.Trash width={14} height={14} />
                    </IconBtn>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RequirementForm({
  teams,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  teams: TeamOption[];
  initial?: RequirementInput;
  submitLabel: string;
  onSubmit: (values: RequirementInput) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [kind, setKind] = useState<RequirementKind>(initial?.kind ?? "task");
  const [amount, setAmount] = useState(initial?.amount ?? "");
  const [allowFile, setAllowFile] = useState(initial?.allowFile ?? true);
  const [dueOn, setDueOn] = useState(initial?.dueOn ?? "");
  const [allTeams, setAllTeams] = useState(!initial?.teamIds?.length);
  const [teamIds, setTeamIds] = useState<string[]>(initial?.teamIds ?? []);
  const [active, setActive] = useState(initial?.active ?? true);
  const [pending, setPending] = useState(false);

  function toggleTeam(id: string) {
    setTeamIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  const ready = !!name.trim() && (kind !== "fee" || !!amount.trim()) && (allTeams || teamIds.length > 0);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ready) return;
    setPending(true);
    await onSubmit({
      name: name.trim(),
      description,
      kind,
      amount: kind === "fee" ? amount : "",
      allowFile,
      dueOn,
      teamIds: allTeams ? null : teamIds,
      active,
    });
    setPending(false);
  }

  const checkLabel: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    fontWeight: 600,
    color: "var(--gw-fg)",
  };

  return (
    <form onSubmit={handleSubmit} className="rsd-card" style={{ gap: 14, padding: "16px 18px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        <div data-tour="requirement-name">
          <Input
            label="Name *"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Handbook signature"
            maxLength={REQUIREMENT_NAME_MAX}
            help="What the board sees on each player, like Handbook signature or Tournament fee."
            autoFocus
            required
          />
        </div>
        <div data-tour="requirement-kind">
          <Select
            label="Type"
            value={kind}
            onChange={(e) => setKind(e.target.value as RequirementKind)}
            help="A fee is marked Paid; anything else is marked Done."
          >
            <option value="task">Task / form</option>
            <option value="fee">Fee</option>
          </Select>
        </div>
        {kind === "fee" && (
          <Input
            label="Amount *"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="e.g. 25.00"
            inputMode="decimal"
            required
          />
        )}
        <div data-tour="requirement-due">
          <Input
            label="Due date"
            type="date"
            value={dueOn}
            onChange={(e) => setDueOn(e.target.value)}
            help="Optional. Shown to the board as a reminder."
          />
        </div>
      </div>
      <Textarea
        label="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="e.g. Last page of the handbook, signed by the player and a parent."
        rows={2}
      />

      <div data-tour="requirement-applies" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--gw-fg)" }}>Applies to</span>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <label style={checkLabel}>
            <input type="radio" name="applies" checked={allTeams} onChange={() => setAllTeams(true)} />
            All players
          </label>
          <label style={checkLabel}>
            <input type="radio" name="applies" checked={!allTeams} onChange={() => setAllTeams(false)} />
            Only some teams
          </label>
        </div>
        {!allTeams &&
          (teams.length === 0 ? (
            <span style={{ fontSize: 12, color: "var(--gw-fg-muted)" }}>No teams this season yet.</span>
          ) : (
            <div style={{ display: "flex", gap: "6px 16px", flexWrap: "wrap", paddingLeft: 4 }}>
              {teams.map((t) => (
                <label key={t.id} style={checkLabel}>
                  <input type="checkbox" checked={teamIds.includes(t.id)} onChange={() => toggleTeam(t.id)} />
                  {teamLabel(t)}
                </label>
              ))}
            </div>
          ))}
      </div>

      <div data-tour="requirement-options" style={{ display: "flex", gap: "8px 20px", flexWrap: "wrap" }}>
        <label style={checkLabel}>
          <input type="checkbox" checked={allowFile} onChange={(e) => setAllowFile(e.target.checked)} />
          Offer scan upload
        </label>
        <label style={checkLabel}>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Active
        </label>
      </div>

      <div data-tour="requirement-save" style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Pill variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          Cancel
        </Pill>
        <Pill variant="accent" size="sm" type="submit" disabled={pending || !ready}>
          {pending ? "Saving…" : submitLabel}
        </Pill>
      </div>
    </form>
  );
}

function OrderBtn({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
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
