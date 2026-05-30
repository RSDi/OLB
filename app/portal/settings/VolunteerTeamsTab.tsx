"use client";
import { useState, useEffect, useCallback, useTransition } from "react";
import { Icons } from "../../components/icons";
import { Input, Pill, Select } from "../../components/ui";
import { createClient } from "../../../lib/supabase/client";
import {
  createTeam,
  updateTeam,
  deleteTeam,
  assignMemberToTeam,
  removeMemberFromTeam,
  type VolunteerTeamRole,
} from "../../../lib/volunteer-teams/actions";

interface Team {
  id: string;
  name: string;
  description: string | null;
}

interface MemberOption {
  id: string;
  full_name: string | null;
  email: string;
}

interface Membership {
  member_id: string;
  team_id: string;
  role: VolunteerTeamRole;
}

export function VolunteerTeamsTab() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [addingTeam, setAddingTeam] = useState(false);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);

  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [draftMember, setDraftMember] = useState("");
  const [draftRole, setDraftRole] = useState<VolunteerTeamRole>("member");
  const [acting, setActing] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(async () => {
    const supabase = createClient();
    const [{ data: t }, { data: m }, { data: mt }] = await Promise.all([
      supabase
        .from("volunteer_teams")
        .select("id, name, description")
        .order("name", { ascending: true }),
      supabase
        .from("members")
        .select("id, full_name, email")
        .eq("status", "approved")
        .order("full_name", { ascending: true }),
      supabase.from("member_volunteer_teams").select("member_id, team_id, role"),
    ]);
    setTeams((t as Team[]) ?? []);
    setMembers((m as MemberOption[]) ?? []);
    setMemberships((mt as Membership[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function memberLabel(m: MemberOption): string {
    return m.full_name ?? m.email;
  }

  function membershipsFor(teamId: string): { leads: Membership[]; regulars: Membership[] } {
    const all = memberships.filter((x) => x.team_id === teamId);
    return {
      leads: all.filter((x) => x.role === "lead"),
      regulars: all.filter((x) => x.role === "member"),
    };
  }

  // --- team CRUD ---
  async function handleCreateTeam(name: string, description: string) {
    setError(null);
    const result = await createTeam(name, description);
    if (result.error) {
      setError(result.error);
      return;
    }
    setAddingTeam(false);
    await load();
  }

  async function handleUpdateTeam(teamId: string, name: string, description: string) {
    setError(null);
    setActing(`team:${teamId}`);
    const result = await updateTeam(teamId, name, description);
    if (result.error) {
      setError(result.error);
      setActing(null);
      return;
    }
    setEditingTeamId(null);
    await load();
    setActing(null);
  }

  function handleDeleteTeam(teamId: string, name: string) {
    if (!confirm(`Delete the "${name}" team? Member assignments to it will be removed.`)) return;
    setError(null);
    setActing(`team:${teamId}`);
    startTransition(async () => {
      const result = await deleteTeam(teamId);
      if (result.error) setError(result.error);
      else await load();
      setActing(null);
    });
  }

  // --- assignments ---
  function startAdding(teamId: string) {
    setAddingFor(teamId);
    setDraftMember("");
    setDraftRole("member");
    setError(null);
  }

  function cancelAdding() {
    setAddingFor(null);
    setDraftMember("");
    setError(null);
  }

  function handleAdd(teamId: string) {
    if (!draftMember) {
      setError("Pick a member.");
      return;
    }
    setError(null);
    setActing(`${teamId}:${draftMember}`);
    startTransition(async () => {
      const result = await assignMemberToTeam(draftMember, teamId, draftRole);
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

  function handleChangeRole(teamId: string, memberId: string, nextRole: VolunteerTeamRole) {
    setError(null);
    setActing(`${teamId}:${memberId}`);
    startTransition(async () => {
      const result = await assignMemberToTeam(memberId, teamId, nextRole);
      if (result.error) setError(result.error);
      else await load();
      setActing(null);
    });
  }

  function handleRemove(teamId: string, memberId: string, memberName: string, teamName: string) {
    if (!confirm(`Remove ${memberName} from ${teamName}?`)) return;
    setError(null);
    setActing(`${teamId}:${memberId}`);
    startTransition(async () => {
      const result = await removeMemberFromTeam(memberId, teamId);
      if (result.error) setError(result.error);
      else await load();
      setActing(null);
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500, maxWidth: 540 }}>
          Volunteer teams group members who serve together (Worship, Kids, Tech…). Assign approved
          members as <strong>leads</strong> or <strong>members</strong>. Teams are filterable in the
          member directory.
        </div>
        {!addingTeam && (
          <Pill variant="accent" size="sm" onClick={() => setAddingTeam(true)}>
            <Icons.Plus width={14} height={14} /> Add team
          </Pill>
        )}
      </div>

      {error && <ErrorBanner message={error} />}

      {addingTeam && (
        <TeamForm
          submitLabel="Add team"
          onCancel={() => {
            setAddingTeam(false);
            setError(null);
          }}
          onSubmit={handleCreateTeam}
        />
      )}

      {loading ? (
        <div style={{ padding: "40px 0", textAlign: "center", color: "var(--gw-fg-muted)", fontSize: 13 }}>
          Loading…
        </div>
      ) : teams.length === 0 ? (
        <div className="rsd-card" style={{ textAlign: "center", padding: "40px 24px" }}>
          <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
            No volunteer teams yet.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {teams.map((team) => {
            if (editingTeamId === team.id) {
              return (
                <TeamForm
                  key={team.id}
                  initialName={team.name}
                  initialDescription={team.description ?? ""}
                  submitLabel="Save"
                  onCancel={() => {
                    setEditingTeamId(null);
                    setError(null);
                  }}
                  onSubmit={(name, description) => handleUpdateTeam(team.id, name, description)}
                />
              );
            }

            const { leads, regulars } = membershipsFor(team.id);
            const assignedIds = new Set([...leads, ...regulars].map((x) => x.member_id));
            const available = members.filter((m) => !assignedIds.has(m.id));
            const adding = addingFor === team.id;
            const teamActing = acting === `team:${team.id}`;

            return (
              <div
                key={team.id}
                className="rsd-card"
                style={{ gap: 12, padding: "16px 18px", opacity: teamActing ? 0.5 : 1, transition: "opacity 150ms" }}
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
                  <div style={{ minWidth: 0 }}>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--gw-fg)" }}>
                      {team.name}
                    </h3>
                    {team.description && (
                      <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 500, marginTop: 2 }}>
                        {team.description}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    {!adding && (
                      <Pill
                        variant="ghost"
                        size="sm"
                        onClick={() => startAdding(team.id)}
                        disabled={available.length === 0}
                      >
                        <Icons.Plus width={12} height={12} />
                        {available.length === 0 ? "All members assigned" : "Assign member"}
                      </Pill>
                    )}
                    <IconBtn onClick={() => setEditingTeamId(team.id)} disabled={teamActing} title="Edit team">
                      <Icons.Pencil width={14} height={14} />
                    </IconBtn>
                    <IconBtn
                      onClick={() => handleDeleteTeam(team.id, team.name)}
                      disabled={teamActing}
                      title="Delete team"
                      danger
                    >
                      <Icons.Trash width={14} height={14} />
                    </IconBtn>
                  </div>
                </div>

                <RoleSection
                  label="Leads"
                  count={leads.length}
                  emptyHint={leads.length === 0 ? "No team lead assigned yet." : null}
                >
                  {leads.map((l) => {
                    const m = members.find((x) => x.id === l.member_id);
                    const label = m ? memberLabel(m) : "(unknown member)";
                    const isActing = acting === `${team.id}:${l.member_id}`;
                    return (
                      <Chip
                        key={`${team.id}:${l.member_id}`}
                        label={label}
                        accent
                        disabled={isActing}
                        onChangeRole={() => handleChangeRole(team.id, l.member_id, "member")}
                        changeRoleLabel="→ Member"
                        onRemove={() => handleRemove(team.id, l.member_id, label, team.name)}
                      />
                    );
                  })}
                </RoleSection>

                <RoleSection label="Members" count={regulars.length} emptyHint={null}>
                  {regulars.map((r) => {
                    const m = members.find((x) => x.id === r.member_id);
                    const label = m ? memberLabel(m) : "(unknown member)";
                    const isActing = acting === `${team.id}:${r.member_id}`;
                    return (
                      <Chip
                        key={`${team.id}:${r.member_id}`}
                        label={label}
                        accent={false}
                        disabled={isActing}
                        onChangeRole={() => handleChangeRole(team.id, r.member_id, "lead")}
                        changeRoleLabel="→ Lead"
                        onRemove={() => handleRemove(team.id, r.member_id, label, team.name)}
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
                    <Select label="Member" value={draftMember} onChange={(e) => setDraftMember(e.target.value)}>
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
                      onChange={(e) => setDraftRole(e.target.value as VolunteerTeamRole)}
                    >
                      <option value="member">Member</option>
                      <option value="lead">Lead</option>
                    </Select>
                    <Pill variant="accent" size="sm" onClick={() => handleAdd(team.id)} disabled={pending || !draftMember}>
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

function TeamForm({
  initialName = "",
  initialDescription = "",
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initialName?: string;
  initialDescription?: string;
  submitLabel: string;
  onSubmit: (name: string, description: string) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSubmitting(true);
    await onSubmit(trimmed, description.trim());
    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="rsd-card" style={{ gap: 14, padding: "16px 18px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
        <Input
          label="Name"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Worship"
          autoFocus
          required
        />
        <Input
          label="Description"
          name="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional — what this team does"
        />
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Pill variant="ghost" size="sm" onClick={onCancel} disabled={submitting}>
          Cancel
        </Pill>
        <Pill variant="accent" size="sm" type="submit" disabled={submitting || !name.trim()}>
          {submitting ? "Saving…" : submitLabel}
        </Pill>
      </div>
    </form>
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
  onChangeRole: () => void;
  changeRoleLabel: string;
  onRemove: () => void;
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
    </span>
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
  const color = danger ? "var(--gw-error)" : "var(--gw-fg-muted)";
  const bg = danger ? "var(--gw-error-bg)" : "var(--gw-bg-elev)";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: bg,
        color,
        border: `1px solid ${danger ? "rgba(229,62,62,.25)" : "var(--gw-border)"}`,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "opacity 120ms",
      }}
    >
      {children}
    </button>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
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
      {message}
    </div>
  );
}
