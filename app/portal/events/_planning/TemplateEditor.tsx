"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "../../../components/icons";
import { Input, Pill, Select, Textarea } from "../../../components/ui";
import {
  createPlanningTemplate,
  deletePlanningTemplate,
  updatePlanningTemplate,
  type TemplateInput,
} from "../../../../lib/planning/actions";
import { sortTemplates } from "../../../../lib/planning/logic";
import { SEASON_START_MONTH, monthName } from "../../../../lib/planning/season";
import type { PlanningRole, PlanningTemplate, PlaybookLink, TemplateKind } from "../../../../lib/planning/types";
import { PlaybookChip, RoleChip } from "./chips";

// The months in season order, year-round first.
const GROUPS: (number | null)[] = [null, ...Array.from({ length: 12 }, (_, i) => ((SEASON_START_MONTH - 1 + i) % 12) + 1)];

type Editing = { id: string } | { adding: { month: number | null; kind: TemplateKind } } | null;

// The yearly template, month by month: what each role does, and the topics
// for each month's board meeting. Every season sent to Review starts as a copy.
export function TemplateEditor({
  templates,
  roles,
  playbooks,
}: {
  templates: PlanningTemplate[];
  roles: PlanningRole[];
  playbooks: PlaybookLink[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Editing>(null);
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const roleById = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);
  const playbookById = useMemo(() => new Map(playbooks.map((p) => [p.id, p])), [playbooks]);
  const roleRank = useMemo(() => new Map(roles.map((r, i) => [r.id, i])), [roles]);

  const byGroup = useMemo(() => {
    const out = new Map<number | null, { tasks: PlanningTemplate[]; agenda: PlanningTemplate[] }>();
    for (const g of GROUPS) out.set(g, { tasks: [], agenda: [] });
    for (const t of sortTemplates(templates)) {
      const g = out.get(t.month);
      if (!g) continue;
      if (t.kind === "agenda") g.agenda.push(t);
      else if (!roleFilter || t.role_id === roleFilter) g.tasks.push(t);
    }
    for (const g of out.values()) {
      g.tasks.sort(
        (a, b) =>
          (a.role_id ? roleRank.get(a.role_id) ?? 500 : 1000) - (b.role_id ? roleRank.get(b.role_id) ?? 500 : 1000) ||
          a.sort_order - b.sort_order,
      );
    }
    return out;
  }, [templates, roleFilter, roleRank]);

  const monthlyCount = templates.filter((t) => t.kind === "task" && t.month != null).length;
  const yearRoundCount = templates.filter((t) => t.kind === "task" && t.month == null).length;
  const agendaCount = templates.filter((t) => t.kind === "agenda").length;

  function run(action: () => Promise<{ error?: string }>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await action();
      if (res.error) {
        setError(res.error);
        return;
      }
      after?.();
      router.refresh();
    });
  }

  function remove(t: PlanningTemplate) {
    if (!confirm(`Remove "${t.title}" from the template? Seasons already sent to Review keep their copy.`)) return;
    run(() => deletePlanningTemplate(t.id));
  }

  const isEditing = (id: string) => editing !== null && "id" in editing && editing.id === id;
  const isAdding = (month: number | null, kind: TemplateKind) =>
    editing !== null && "adding" in editing && editing.adding.month === month && editing.adding.kind === kind;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <p style={{ margin: 0, fontSize: 14, color: "var(--gw-fg-muted)", lineHeight: 1.6, maxWidth: 680 }}>
        The board&apos;s year, month by month: {monthlyCount} monthly tasks, {yearRoundCount} year-round duties and{" "}
        {agendaCount} board meeting topics. Each season
        sent to Review starts as a copy of this, so changes here shape next season, not the ones already sent.
        Link a playbook to any task that has one. Roles are managed in Settings → Planning Roles.
      </p>

      {roles.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {[null, ...roles.map((r) => r.id)].map((id) => {
            const on = roleFilter === id;
            return (
              <button
                key={id ?? "all"}
                type="button"
                onClick={() => setRoleFilter(id)}
                style={{
                  padding: "5px 12px",
                  borderRadius: 100,
                  fontSize: 12,
                  fontWeight: 700,
                  border: "1px solid",
                  borderColor: on ? "var(--rsd-accent)" : "var(--gw-border)",
                  background: on ? "var(--rsd-accent-fill)" : "transparent",
                  color: on ? "var(--rsd-accent-fill-on)" : "var(--gw-fg-muted)",
                  cursor: "pointer",
                }}
              >
                {id ? roleById.get(id)?.name : "Everyone"}
              </button>
            );
          })}
        </div>
      )}

      {error && (
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--gw-error)", background: "var(--gw-error-bg)", borderRadius: 10, padding: "10px 14px" }}>
          {error}
        </div>
      )}

      {GROUPS.map((month) => {
        const g = byGroup.get(month)!;
        return (
          <div key={month ?? "year"} className="rsd-card" style={{ gap: 0, padding: 0, overflow: "hidden" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "12px 18px",
                borderBottom: "1px solid var(--gw-border)",
                flexWrap: "wrap",
              }}
            >
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>{month == null ? "Year-round" : monthName(month)}</h3>
              <span style={{ fontSize: 12, color: "var(--gw-fg-muted)" }}>
                {month == null ? "Duties that run all season (for reference, not sent to Review)" : `${g.tasks.length} tasks`}
              </span>
              <span style={{ marginLeft: "auto" }}>
                <Pill size="sm" variant="ghost" disabled={pending} onClick={() => setEditing({ adding: { month, kind: "task" } })}>
                  <Icons.Plus width={12} height={12} /> Task
                </Pill>
              </span>
            </div>

            {isAdding(month, "task") && (
              <TemplateForm
                initial={{ kind: "task", title: "", notes: "", month, roleId: roleFilter, playbookId: null, sortOrder: nextSort(g.tasks) }}
                roles={roles}
                playbooks={playbooks}
                submitLabel="Add task"
                pending={pending}
                onCancel={() => setEditing(null)}
                onSubmit={(v) => run(() => createPlanningTemplate(v), () => setEditing(null))}
              />
            )}
            {g.tasks.length === 0 && !isAdding(month, "task") && (
              <div style={{ padding: "12px 18px", fontSize: 13, color: "var(--gw-fg-muted)" }}>
                {roleFilter ? "Nothing for this role this month." : "No tasks this month."}
              </div>
            )}
            {g.tasks.map((t) =>
              isEditing(t.id) ? (
                <TemplateForm
                  key={t.id}
                  initial={toInput(t)}
                  roles={roles}
                  playbooks={playbooks}
                  submitLabel="Save"
                  pending={pending}
                  onCancel={() => setEditing(null)}
                  onSubmit={(v) => run(() => updatePlanningTemplate(t.id, v), () => setEditing(null))}
                />
              ) : (
                <TemplateRow
                  key={t.id}
                  t={t}
                  role={t.role_id ? roleById.get(t.role_id) ?? null : null}
                  playbook={t.playbook_id ? playbookById.get(t.playbook_id) ?? null : null}
                  disabled={pending}
                  onEdit={() => setEditing({ id: t.id })}
                  onDelete={() => remove(t)}
                />
              ),
            )}

            {month != null && (
              <div style={{ background: "var(--rsd-accent-bg)", borderTop: "1px solid var(--gw-border)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 18px" }}>
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--gw-fg-muted)" }}>
                    Board meeting agenda
                  </span>
                  <span style={{ marginLeft: "auto" }}>
                    <Pill size="sm" variant="ghost" disabled={pending} onClick={() => setEditing({ adding: { month, kind: "agenda" } })}>
                      <Icons.Plus width={12} height={12} /> Topic
                    </Pill>
                  </span>
                </div>
                {isAdding(month, "agenda") && (
                  <TemplateForm
                    initial={{ kind: "agenda", title: "", notes: "", month, roleId: null, playbookId: null, sortOrder: nextSort(g.agenda) }}
                    roles={roles}
                    playbooks={playbooks}
                    submitLabel="Add topic"
                    pending={pending}
                    onCancel={() => setEditing(null)}
                    onSubmit={(v) => run(() => createPlanningTemplate(v), () => setEditing(null))}
                  />
                )}
                {g.agenda.length === 0 && !isAdding(month, "agenda") && (
                  <div style={{ padding: "0 18px 12px", fontSize: 13, color: "var(--gw-fg-muted)" }}>No standing topics.</div>
                )}
                {g.agenda.map((t) =>
                  isEditing(t.id) ? (
                    <TemplateForm
                      key={t.id}
                      initial={toInput(t)}
                      roles={roles}
                      playbooks={playbooks}
                      submitLabel="Save"
                      pending={pending}
                      onCancel={() => setEditing(null)}
                      onSubmit={(v) => run(() => updatePlanningTemplate(t.id, v), () => setEditing(null))}
                    />
                  ) : (
                    <TemplateRow
                      key={t.id}
                      t={t}
                      role={null}
                      playbook={t.playbook_id ? playbookById.get(t.playbook_id) ?? null : null}
                      disabled={pending}
                      onEdit={() => setEditing({ id: t.id })}
                      onDelete={() => remove(t)}
                    />
                  ),
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function nextSort(rows: PlanningTemplate[]): number {
  return rows.reduce((m, r) => Math.max(m, r.sort_order), 0) + 10;
}

function toInput(t: PlanningTemplate): TemplateInput {
  return {
    kind: t.kind,
    title: t.title,
    notes: t.notes ?? "",
    month: t.month,
    roleId: t.role_id,
    playbookId: t.playbook_id,
    sortOrder: t.sort_order,
  };
}

function TemplateRow({
  t,
  role,
  playbook,
  disabled,
  onEdit,
  onDelete,
}: {
  t: PlanningTemplate;
  role: PlanningRole | null;
  playbook: PlaybookLink | null;
  disabled: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 18px", borderTop: "1px solid var(--gw-border)" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.4 }}>{t.title}</div>
        {t.notes && <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", marginTop: 2, lineHeight: 1.5 }}>{t.notes}</div>}
        {(role || playbook) && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
            <RoleChip role={role} />
            <PlaybookChip playbook={playbook} />
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <IconButton title="Edit" onClick={onEdit} disabled={disabled}>
          <Icons.Pencil width={14} height={14} />
        </IconButton>
        <IconButton title="Remove" onClick={onDelete} disabled={disabled} danger>
          <Icons.Trash width={14} height={14} />
        </IconButton>
      </div>
    </div>
  );
}

function TemplateForm({
  initial,
  roles,
  playbooks,
  submitLabel,
  pending,
  onSubmit,
  onCancel,
}: {
  initial: TemplateInput;
  roles: PlanningRole[];
  playbooks: PlaybookLink[];
  submitLabel: string;
  pending: boolean;
  onSubmit: (v: TemplateInput) => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState<TemplateInput>(initial);
  const set = <K extends keyof TemplateInput>(k: K, value: TemplateInput[K]) => setV((p) => ({ ...p, [k]: value }));
  const agenda = v.kind === "agenda";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (v.title.trim()) onSubmit(v);
      }}
      style={{ display: "flex", flexDirection: "column", gap: 12, padding: "14px 18px", borderTop: "1px solid var(--gw-border)", background: "var(--gw-bg)" }}
    >
      <Input
        label={agenda ? "Topic *" : "Task *"}
        value={v.title}
        onChange={(e) => set("title", e.target.value)}
        placeholder={agenda ? "e.g. Approve coaches" : "e.g. Update the Player Handbook"}
        autoFocus
        required
      />
      <Textarea
        label="Notes"
        value={v.notes}
        onChange={(e) => set("notes", e.target.value)}
        rows={2}
        placeholder="Details, who to work with, what to watch for"
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
        <Select
          label="Kind"
          value={v.kind}
          onChange={(e) => {
            const kind = e.target.value as TemplateKind;
            setV((p) => ({ ...p, kind, month: kind === "agenda" && p.month == null ? SEASON_START_MONTH : p.month }));
          }}
          help="A task goes to Review each season. A topic goes on that month's board meeting agenda."
        >
          <option value="task">Task</option>
          <option value="agenda">Board meeting topic</option>
        </Select>
        <Select
          label="Month"
          value={v.month == null ? "" : String(v.month)}
          onChange={(e) => set("month", e.target.value ? Number(e.target.value) : null)}
        >
          {!agenda && <option value="">Year-round</option>}
          {GROUPS.filter((g): g is number => g != null).map((m) => (
            <option key={m} value={m}>
              {monthName(m)}
            </option>
          ))}
        </Select>
        {!agenda && (
          <Select label="Role" value={v.roleId ?? ""} onChange={(e) => set("roleId", e.target.value || null)}>
            <option value="">No role</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        )}
        <Select
          label="Playbook"
          value={v.playbookId ?? ""}
          onChange={(e) => set("playbookId", e.target.value || null)}
          help="The playbook that explains how. It shows on the task and on the calendar."
        >
          <option value="">None</option>
          {playbooks.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </Select>
        <Input
          label="Order"
          type="number"
          value={String(v.sortOrder)}
          onChange={(e) => set("sortOrder", Number(e.target.value) || 0)}
          help="Lower numbers list first within the month."
        />
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Pill variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          Cancel
        </Pill>
        <Pill variant="accent" size="sm" type="submit" disabled={pending || !v.title.trim()}>
          {pending ? "Saving…" : submitLabel}
        </Pill>
      </div>
    </form>
  );
}

function IconButton({
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
