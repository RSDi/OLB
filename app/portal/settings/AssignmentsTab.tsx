"use client";
import { useState, useEffect, useCallback, useTransition } from "react";
import { Icons } from "../../components/icons";
import { Pill, Select } from "../../components/ui";
import { createClient } from "../../../lib/supabase/client";
import { canEditSettings, type MemberLike } from "../../../lib/auth/permissions";
import {
  assignMemberToArea,
  removeMemberFromArea,
  type AreaMemberRole,
} from "../../../lib/area-members/actions";

interface Area {
  id: string;
  name: string;
  sort_order: number;
}

interface MemberOption {
  id: string;
  full_name: string | null;
  email: string;
}

interface Assignment {
  id: string;
  area_id: string;
  member_id: string;
  role: AreaMemberRole;
}

export function AssignmentsTab({ me }: { me: MemberLike }) {
  const canEdit = canEditSettings(me);
  const [areas, setAreas] = useState<Area[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [draftMember, setDraftMember] = useState("");
  const [draftRole, setDraftRole] = useState<AreaMemberRole>("owner");
  const [acting, setActing] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(async () => {
    const supabase = createClient();
    const [{ data: a }, { data: m }, { data: am }] = await Promise.all([
      supabase
        .from("areas")
        .select("id, name, sort_order")
        .is("deleted_at", null)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
      supabase
        .from("members")
        .select("id, full_name, email")
        .eq("status", "approved")
        .order("full_name", { ascending: true }),
      supabase.from("area_members").select("id, area_id, member_id, role"),
    ]);
    setAreas((a as Area[]) ?? []);
    setMembers((m as MemberOption[]) ?? []);
    setAssignments((am as Assignment[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function startAdding(areaId: string) {
    setAddingFor(areaId);
    setDraftMember("");
    setDraftRole("owner");
    setError(null);
  }

  function cancelAdding() {
    setAddingFor(null);
    setDraftMember("");
    setError(null);
  }

  function handleAdd(areaId: string) {
    if (!draftMember) {
      setError("Pick a member.");
      return;
    }
    setError(null);
    setActing(`${areaId}:${draftMember}`);
    startTransition(async () => {
      const result = await assignMemberToArea(draftMember, areaId, draftRole);
      if (result.error) {
        setError(result.error);
        setActing(null);
        return;
      }
      cancelAdding();
      await load();
      setActing(null);
    });
  }

  function handleChangeRole(areaId: string, memberId: string, nextRole: AreaMemberRole) {
    setError(null);
    setActing(`${areaId}:${memberId}`);
    startTransition(async () => {
      const result = await assignMemberToArea(memberId, areaId, nextRole);
      if (result.error) setError(result.error);
      else await load();
      setActing(null);
    });
  }

  function handleRemove(areaId: string, memberId: string, memberLabel: string, areaLabel: string) {
    if (!confirm(`Remove ${memberLabel} from ${areaLabel}?`)) return;
    setError(null);
    setActing(`${areaId}:${memberId}`);
    startTransition(async () => {
      const result = await removeMemberFromArea(memberId, areaId);
      if (result.error) setError(result.error);
      else await load();
      setActing(null);
    });
  }

  function memberLabel(m: MemberOption): string {
    return m.full_name ?? m.email;
  }

  function assignmentsFor(areaId: string): { owners: Assignment[]; helpers: Assignment[] } {
    const all = assignments.filter((a) => a.area_id === areaId);
    return {
      owners: all.filter((a) => a.role === "owner"),
      helpers: all.filter((a) => a.role === "helper"),
    };
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500, maxWidth: 540 }}>
        Assign approved members as <strong>owners</strong> (1–2 per area, primary contacts) or{" "}
        <strong>helpers</strong> (everyone else who can pitch in). When a maintenance request is
        submitted for an area, its owners and helpers are emailed alongside the super-admins.
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

      {loading ? (
        <div style={{ padding: "40px 0", textAlign: "center", color: "var(--gw-fg-muted)", fontSize: 13 }}>
          Loading…
        </div>
      ) : areas.length === 0 ? (
        <div className="rsd-card" style={{ textAlign: "center", padding: "40px 24px" }}>
          <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
            No areas yet. Add some on the Areas tab.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {areas.map((area) => {
            const { owners, helpers } = assignmentsFor(area.id);
            const assignedIds = new Set([...owners, ...helpers].map((a) => a.member_id));
            const available = members.filter((m) => !assignedIds.has(m.id));
            const adding = addingFor === area.id;

            return (
              <div
                key={area.id}
                className="rsd-card"
                style={{ gap: 12, padding: "16px 18px" }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--gw-fg)" }}>
                    {area.name}
                  </h3>
                  {canEdit && !adding && (
                    <Pill
                      variant="ghost"
                      size="sm"
                      onClick={() => startAdding(area.id)}
                      disabled={available.length === 0}
                    >
                      <Icons.Plus width={12} height={12} />
                      {available.length === 0 ? "All members assigned" : "Assign member"}
                    </Pill>
                  )}
                </div>

                <RoleSection
                  label="Owners"
                  count={owners.length}
                  emptyHint={
                    owners.length === 0
                      ? "Pick 1–2 people who own this area's upkeep."
                      : null
                  }
                >
                  {owners.map((o) => {
                    const m = members.find((x) => x.id === o.member_id);
                    const label = m ? memberLabel(m) : "(unknown member)";
                    const isActing = acting === `${area.id}:${o.member_id}`;
                    return (
                      <Chip
                        key={o.id}
                        label={label}
                        accent
                        disabled={isActing}
                        onChangeRole={canEdit ? () => handleChangeRole(area.id, o.member_id, "helper") : undefined}
                        changeRoleLabel="→ Helper"
                        onRemove={canEdit ? () => handleRemove(area.id, o.member_id, label, area.name) : undefined}
                      />
                    );
                  })}
                </RoleSection>

                <RoleSection
                  label="Helpers"
                  count={helpers.length}
                  emptyHint={null}
                >
                  {helpers.map((h) => {
                    const m = members.find((x) => x.id === h.member_id);
                    const label = m ? memberLabel(m) : "(unknown member)";
                    const isActing = acting === `${area.id}:${h.member_id}`;
                    return (
                      <Chip
                        key={h.id}
                        label={label}
                        accent={false}
                        disabled={isActing}
                        onChangeRole={canEdit ? () => handleChangeRole(area.id, h.member_id, "owner") : undefined}
                        changeRoleLabel="→ Owner"
                        onRemove={canEdit ? () => handleRemove(area.id, h.member_id, label, area.name) : undefined}
                      />
                    );
                  })}
                </RoleSection>

                {adding && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 140px auto auto",
                      gap: 8,
                      alignItems: "end",
                      paddingTop: 6,
                      borderTop: "1px solid var(--gw-border)",
                    }}
                  >
                    <Select
                      label="Member"
                      value={draftMember}
                      onChange={(e) => setDraftMember(e.target.value)}
                    >
                      <option value="">— Pick a member —</option>
                      {available.map((m) => (
                        <option key={m.id} value={m.id}>
                          {memberLabel(m)}
                        </option>
                      ))}
                    </Select>
                    <Select
                      label="Role"
                      value={draftRole}
                      onChange={(e) => setDraftRole(e.target.value as AreaMemberRole)}
                    >
                      <option value="owner">Owner</option>
                      <option value="helper">Helper</option>
                    </Select>
                    <Pill
                      variant="accent"
                      size="sm"
                      onClick={() => handleAdd(area.id)}
                      disabled={pending || !draftMember}
                    >
                      {pending ? "Adding…" : "Add"}
                    </Pill>
                    <Pill variant="ghost" size="sm" onClick={cancelAdding} disabled={pending}>
                      Cancel
                    </Pill>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RoleSection({
  label,
  count,
  emptyHint,
  children,
}: {
  label: string;
  count: number;
  emptyHint: string | null;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "var(--gw-fg-muted)",
          textTransform: "uppercase",
          letterSpacing: ".04em",
        }}
      >
        {label} {count > 0 && `(${count})`}
      </span>
      {count === 0 ? (
        <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 500, fontStyle: "italic" }}>
          {emptyHint ?? "None assigned"}
        </div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{children}</div>
      )}
    </div>
  );
}

function Chip({
  label,
  accent,
  disabled,
  onChangeRole,
  changeRoleLabel,
  onRemove,
}: {
  label: string;
  accent: boolean;
  disabled: boolean;
  onChangeRole?: () => void;
  changeRoleLabel: string;
  onRemove?: () => void;
}) {
  const bg = accent ? "var(--rsd-accent-bg)" : "var(--gw-bg-elev)";
  const color = accent ? "var(--rsd-accent)" : "var(--gw-fg)";
  const border = accent ? "rgba(108,140,89,.25)" : "var(--gw-border)";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "4px 4px 4px 10px",
        borderRadius: 100,
        background: bg,
        color,
        border: `1px solid ${border}`,
        fontSize: 12,
        fontWeight: 700,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {label}
      {onChangeRole && (
      <button
        type="button"
        onClick={onChangeRole}
        disabled={disabled}
        title={`Change role: ${changeRoleLabel}`}
        style={{
          padding: "2px 8px",
          borderRadius: 100,
          background: "transparent",
          color: "inherit",
          border: "none",
          fontSize: 10,
          fontWeight: 700,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: 0.7,
        }}
      >
        {changeRoleLabel}
      </button>
      )}
      {onRemove && (
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        title="Remove"
        style={{
          width: 20,
          height: 20,
          padding: 0,
          borderRadius: "50%",
          background: "transparent",
          color: "inherit",
          border: "none",
          cursor: disabled ? "not-allowed" : "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: 0.7,
        }}
      >
        <Icons.X width={10} height={10} />
      </button>
      )}
    </span>
  );
}
