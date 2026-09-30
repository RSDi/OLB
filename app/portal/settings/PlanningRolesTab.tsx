"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Icons } from "../../components/icons";
import { Input, Pill, Select } from "../../components/ui";
import { createClient } from "../../../lib/supabase/client";
import {
  createPlanningRole,
  deletePlanningRole,
  updatePlanningRole,
  type RoleInput,
} from "../../../lib/planning/actions";
import { ROLE_CHIP_OPTIONS } from "../../../lib/planning/logic";
import { memberDisplayName } from "../../../lib/members/display";
import type { PlanningRole } from "../../../lib/planning/types";

interface MemberOption {
  id: string;
  name: string;
}

interface RolesData {
  roles: PlanningRole[];
  members: MemberOption[];
  error: string | null;
}

async function fetchRoles(): Promise<RolesData> {
  const supabase = createClient();
  const [{ data, error }, { data: people }] = await Promise.all([
    supabase
      .from("planning_roles")
      .select("id, name, chip_class, member_id, sort_order")
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("members")
      .select("id, full_name, nickname, email")
      .eq("status", "approved")
      .is("deleted_at", null)
      .order("full_name", { ascending: true }),
  ]);
  return {
    roles: (data as PlanningRole[] | null) ?? [],
    members: ((people as { id: string; full_name: string | null; nickname: string | null; email: string }[] | null) ?? []).map(
      (m) => ({ id: m.id, name: memberDisplayName(m) }),
    ),
    error: error ? "Planning Roles need migration 0104. Apply it in the Supabase SQL editor." : null,
  };
}

// The roles Planning's tasks belong to (President, Athletic Director,
// Treasurer, Communications, Coaches…) and who holds each one. When the board
// keeps a season's task in Review, it's assigned to the role's holder.
export function PlanningRolesTab() {
  const [roles, setRoles] = useState<PlanningRole[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((d: RolesData) => {
    if (d.error) setError(d.error);
    else setRoles(d.roles);
    setMembers(d.members);
    setLoading(false);
  }, []);

  const load = useCallback(async () => apply(await fetchRoles()), [apply]);

  useEffect(() => {
    let cancelled = false;
    fetchRoles().then((d) => {
      if (!cancelled) apply(d);
    });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  const memberName = useMemo(() => new Map(members.map((m) => [m.id, m.name])), [members]);

  async function handleAdd(values: RoleInput) {
    setError(null);
    const res = await createPlanningRole(values);
    if (res.error) {
      setError(res.error);
      return;
    }
    setAdding(false);
    await load();
  }

  async function handleUpdate(id: string, values: RoleInput) {
    setError(null);
    setActing(id);
    const res = await updatePlanningRole(id, values);
    setActing(null);
    if (res.error) {
      setError(res.error);
      return;
    }
    setEditingId(null);
    await load();
  }

  async function handleDelete(role: PlanningRole) {
    if (!confirm(`Remove the "${role.name}" role? Its tasks stay; they just show without a role.`)) return;
    setError(null);
    setActing(role.id);
    const res = await deletePlanningRole(role.id);
    setActing(null);
    if (res.error) setError(res.error);
    else await load();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500, maxWidth: 560, lineHeight: 1.6 }}>
          Who does the work in Planning. Every task in the Template belongs to a role, and the calendar can show one
          role at a time. Name who holds a role and the tasks the board keeps for it are assigned to them.
        </div>
        {!adding && (
          <Pill variant="accent" size="sm" onClick={() => setAdding(true)}>
            <Icons.Plus width={14} height={14} /> Add role
          </Pill>
        )}
      </div>

      {error && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "var(--gw-error-bg)",
            border: "1px solid rgba(229,62,62,.25)",
            borderRadius: 10,
            padding: "12px 16px",
            fontSize: 13,
            color: "var(--gw-error)",
            fontWeight: 600,
          }}
        >
          <Icons.AlertCircle width={16} height={16} />
          {error}
        </div>
      )}

      {adding && (
        <RoleForm
          members={members}
          submitLabel="Add role"
          onCancel={() => {
            setAdding(false);
            setError(null);
          }}
          onSubmit={handleAdd}
          nextSort={roles.reduce((m, r) => Math.max(m, r.sort_order), 0) + 10}
        />
      )}

      {loading ? (
        <div style={{ padding: "40px 0", textAlign: "center", color: "var(--gw-fg-muted)", fontSize: 13 }}>Loading…</div>
      ) : roles.length === 0 ? (
        <div className="rsd-card" style={{ textAlign: "center", padding: "40px 24px" }}>
          <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>No roles yet.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {roles.map((r) =>
            editingId === r.id ? (
              <RoleForm
                key={r.id}
                members={members}
                initial={{ name: r.name, chipClass: r.chip_class, memberId: r.member_id, sortOrder: r.sort_order }}
                submitLabel="Save"
                onCancel={() => {
                  setEditingId(null);
                  setError(null);
                }}
                onSubmit={(v) => handleUpdate(r.id, v)}
                nextSort={r.sort_order}
              />
            ) : (
              <div
                key={r.id}
                className="rsd-card"
                style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: "12px 18px", opacity: acting === r.id ? 0.5 : 1 }}
              >
                <span className={`rsd-chip ${r.chip_class}`}>{r.name}</span>
                <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
                  {r.member_id ? (
                    <>
                      Held by <strong style={{ color: "var(--gw-fg)" }}>{memberName.get(r.member_id) ?? "someone no longer listed"}</strong>
                    </>
                  ) : (
                    "Nobody named yet"
                  )}
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <IconBtn title="Edit" disabled={acting === r.id} onClick={() => setEditingId(r.id)}>
                    <Icons.Pencil width={14} height={14} />
                  </IconBtn>
                  <IconBtn title="Remove" disabled={acting === r.id} onClick={() => handleDelete(r)} danger>
                    <Icons.Trash width={14} height={14} />
                  </IconBtn>
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}

function RoleForm({
  members,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  nextSort,
}: {
  members: MemberOption[];
  initial?: RoleInput;
  submitLabel: string;
  onSubmit: (v: RoleInput) => void | Promise<void>;
  onCancel: () => void;
  nextSort: number;
}) {
  const start: RoleInput = initial ?? { name: "", chipClass: "rsd-chip-mute", memberId: null, sortOrder: nextSort };
  const [name, setName] = useState(start.name);
  const [chipClass, setChipClass] = useState(start.chipClass);
  const [memberId, setMemberId] = useState(start.memberId ?? "");
  const [sortOrder, setSortOrder] = useState(String(start.sortOrder));
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return;
    setPending(true);
    await onSubmit({ name: name.trim(), chipClass, memberId: memberId || null, sortOrder: Number(sortOrder) || 100 });
    setPending(false);
  }

  return (
    <form onSubmit={submit} className="rsd-card" style={{ gap: 14, padding: "16px 18px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <Input label="Role *" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Treasurer" autoFocus required />
        <Select
          label="Held by"
          value={memberId}
          onChange={(e) => setMemberId(e.target.value)}
          help="Tasks the board keeps for this role are assigned to this person. Leave it empty for a role several people share, like Coaches."
        >
          <option value="">Nobody named</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Select>
        <Select label="Chip color" value={chipClass} onChange={(e) => setChipClass(e.target.value)}>
          {ROLE_CHIP_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        <Input label="Order" type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} help="Lower numbers list first." />
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
        <span className={`rsd-chip ${chipClass}`}>{name || "Preview"}</span>
        <div style={{ display: "flex", gap: 8 }}>
          <Pill variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
            Cancel
          </Pill>
          <Pill variant="accent" size="sm" type="submit" disabled={pending || !name.trim()}>
            {pending ? "Saving…" : submitLabel}
          </Pill>
        </div>
      </div>
    </form>
  );
}

function IconBtn({
  children,
  onClick,
  disabled,
  title,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
  title: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: danger ? "var(--gw-error-bg)" : "var(--gw-bg-elev)",
        color: danger ? "var(--gw-error)" : "var(--gw-fg-muted)",
        border: `1px solid ${danger ? "rgba(229,62,62,.25)" : "var(--gw-border)"}`,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </button>
  );
}
