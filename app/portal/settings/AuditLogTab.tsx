"use client";
import { useState, useEffect, useCallback } from "react";
import { Icons } from "../../components/icons";
import { createClient } from "../../../lib/supabase/client";
import { memberDisplayName } from "../../../lib/members/display";
import { ShowMeHow } from "../../components/ShowMeHow";

type AuditAction = "insert" | "update" | "delete";

interface AuditRow {
  id: string;
  member_id: string | null;
  changed_by: string | null;
  changed_at: string;
  action: AuditAction;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  // The super-admin behind a change made during a "Preview as" (0099).
  impersonator_user_id?: string | null;
}

// Columns that change on every write and would just be noise in a diff.
const IGNORED_FIELDS = new Set(["updated_at", "reviewed_at"]);

export function AuditLogTab() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [actorNames, setActorNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error: loadError } = await supabase
      .from("member_audit_log")
      .select("id, member_id, changed_by, changed_at, action, old_data, new_data")
      .order("changed_at", { ascending: false })
      .limit(100);
    if (loadError) {
      setError(loadError.message);
      setLoading(false);
      return;
    }
    let auditRows = (data as AuditRow[]) ?? [];

    // Who was previewing, for changes made during a "Preview as". A separate,
    // best-effort query so the log still loads before migration 0099.
    if (auditRows.length > 0) {
      const { data: imp } = await supabase
        .from("member_audit_log")
        .select("id, impersonator_user_id")
        .in("id", auditRows.map((r) => r.id))
        .not("impersonator_user_id", "is", null);
      const byId = new Map(
        ((imp as { id: string; impersonator_user_id: string }[] | null) ?? []).map((r) => [r.id, r.impersonator_user_id])
      );
      auditRows = auditRows.map((r) => ({ ...r, impersonator_user_id: byId.get(r.id) ?? null }));
    }
    setRows(auditRows);

    // Resolve changed_by and impersonator (auth user ids) to member names.
    const actorIds = [
      ...new Set(auditRows.flatMap((r) => [r.changed_by, r.impersonator_user_id]).filter(Boolean)),
    ] as string[];
    if (actorIds.length > 0) {
      const { data: actors } = await supabase
        .from("members")
        .select("user_id, full_name, nickname, email")
        .in("user_id", actorIds);
      const map: Record<string, string> = {};
      for (const a of (actors as { user_id: string; full_name: string | null; nickname: string | null; email: string | null }[]) ?? []) {
        map[a.user_id] = memberDisplayName(a);
      }
      setActorNames(map);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500, maxWidth: 540 }}>
          Every change to a member record — who changed what, and when. Most recent first (last 100 changes).
        </div>
        <ShowMeHow tour="settings-audit-log" />
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
      ) : rows.length === 0 ? (
        <div className="rsd-card" style={{ textAlign: "center", padding: "40px 24px" }}>
          <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
            No member changes recorded yet.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map((r) => (
            <AuditEntry
              key={r.id}
              row={r}
              actorName={actorLabel(r, actorNames)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// "Pat Smith", or "Jeff Malone (as Pat Smith)" for a change made during a
// "Preview as".
function actorLabel(row: AuditRow, names: Record<string, string>): string {
  const actor = row.changed_by ? names[row.changed_by] ?? "Unknown" : "System";
  if (!row.impersonator_user_id) return actor;
  return `${names[row.impersonator_user_id] ?? "A super-admin"} (as ${actor})`;
}

function AuditEntry({ row, actorName }: { row: AuditRow; actorName: string }) {
  const subject = row.new_data ?? row.old_data ?? {};
  const subjectName = memberDisplayName({
    full_name: (subject["full_name"] as string | null) ?? null,
    nickname: (subject["nickname"] as string | null) ?? null,
    email: (subject["email"] as string | null) ?? null,
  });
  const changes = diffFields(row.old_data, row.new_data, row.action);

  return (
    <div data-tour="audit-entry" className="rsd-card" style={{ padding: "14px 18px", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <ActionChip action={row.action} />
        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--gw-fg)" }}>{subjectName}</span>
        <span style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
          by {actorName} · {formatWhen(row.changed_at)}
        </span>
      </div>

      {row.action === "update" && changes.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {changes.map((c) => (
            <div key={c.field} style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
              <span style={{ fontWeight: 700, color: "var(--gw-fg)" }}>{c.field}</span>:{" "}
              <span style={{ textDecoration: "line-through", opacity: 0.7 }}>{c.old}</span>
              {" → "}
              <span style={{ color: "var(--gw-fg)", fontWeight: 600 }}>{c.new}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ActionChip({ action }: { action: AuditAction }) {
  const cls =
    action === "insert" ? "rsd-chip-success" : action === "delete" ? "rsd-chip-warn" : "rsd-chip-mute";
  const label = action === "insert" ? "Created" : action === "delete" ? "Deleted" : "Updated";
  return <span className={`rsd-chip ${cls}`}>{label}</span>;
}

interface FieldChange {
  field: string;
  old: string;
  new: string;
}

function diffFields(
  oldData: Record<string, unknown> | null,
  newData: Record<string, unknown> | null,
  action: AuditAction
): FieldChange[] {
  if (action !== "update" || !oldData || !newData) return [];
  const keys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
  const out: FieldChange[] = [];
  for (const key of keys) {
    if (IGNORED_FIELDS.has(key)) continue;
    const o = oldData[key];
    const n = newData[key];
    if (JSON.stringify(o) === JSON.stringify(n)) continue;
    out.push({ field: key, old: formatValue(o), new: formatValue(n) });
  }
  return out.sort((a, b) => a.field.localeCompare(b.field));
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
