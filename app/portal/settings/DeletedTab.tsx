"use client";
import { useState, useEffect, useCallback } from "react";
import { Icons } from "../../components/icons";
import { createClient } from "../../../lib/supabase/client";
import {
  restorePmTemplate,
  hardDeletePmTemplate,
} from "../../../lib/pm/actions";

type Kind = "areas" | "priorities" | "pm_templates";

const SUBTABS: { key: Kind; label: string }[] = [
  { key: "areas", label: "Areas" },
  { key: "priorities", label: "Priorities" },
  { key: "pm_templates", label: "PM Templates" },
];

interface DeletedArea {
  id: string;
  name: string;
  sort_order: number;
  deleted_at: string;
}
interface DeletedPriority {
  id: string;
  key: string;
  label: string;
  severity: number;
  chip_class: string;
  deleted_at: string;
}
interface DeletedPmTemplate {
  id: string;
  title: string;
  schedule_kind: string;
  schedule_value: number;
  instance_count: number;
  deleted_at: string;
}

export function DeletedTab() {
  const [kind, setKind] = useState<Kind>("areas");
  const [areas, setAreas] = useState<DeletedArea[]>([]);
  const [priorities, setPriorities] = useState<DeletedPriority[]>([]);
  const [templates, setTemplates] = useState<DeletedPmTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const supabase = createClient();
    const [
      { data: a, error: ae },
      { data: p, error: pe },
      { data: t, error: te },
    ] = await Promise.all([
      supabase
        .from("areas")
        .select("id, name, sort_order, deleted_at")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false }),
      supabase
        .from("priorities")
        .select("id, key, label, severity, chip_class, deleted_at")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false }),
      supabase
        .from("pm_templates")
        .select(
          `id, title, schedule_kind, schedule_value, deleted_at,
           instance_count:pm_instances(count)`
        )
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false }),
    ]);
    if (ae || pe || te) {
      setError(ae?.message ?? pe?.message ?? te?.message ?? "Failed to load");
    } else {
      setAreas((a as DeletedArea[]) ?? []);
      setPriorities((p as DeletedPriority[]) ?? []);
      // Flatten the count aggregation Supabase returns into a number.
      interface RawTemplateRow {
        id: string;
        title: string;
        schedule_kind: string;
        schedule_value: number;
        deleted_at: string;
        instance_count: { count: number }[];
      }
      setTemplates(
        ((t as RawTemplateRow[]) ?? []).map((row) => ({
          id: row.id,
          title: row.title,
          schedule_kind: row.schedule_kind,
          schedule_value: row.schedule_value,
          deleted_at: row.deleted_at,
          instance_count: row.instance_count?.[0]?.count ?? 0,
        }))
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function restore(table: Kind, id: string) {
    setActing(id);
    setError(null);
    if (table === "pm_templates") {
      const result = await restorePmTemplate(id);
      if (result.error) setError(result.error);
      else await load();
      setActing(null);
      return;
    }
    const supabase = createClient();
    const { error: e } = await supabase.from(table).update({ deleted_at: null }).eq("id", id);
    if (e) setError(e.message);
    else await load();
    setActing(null);
  }

  async function hardDelete(table: Kind, id: string, label: string, extraWarning?: string) {
    const baseMsg = `Permanently delete "${label}"? This cannot be undone.`;
    if (!confirm(extraWarning ? `${baseMsg}\n\n${extraWarning}` : baseMsg)) return;
    setActing(id);
    setError(null);
    if (table === "pm_templates") {
      const result = await hardDeletePmTemplate(id);
      if (result.error) setError(result.error);
      else await load();
      setActing(null);
      return;
    }
    const supabase = createClient();
    const { error: e } = await supabase.from(table).delete().eq("id", id);
    if (e) setError(e.message);
    else await load();
    setActing(null);
  }

  const counts: Record<Kind, number> = {
    areas: areas.length,
    priorities: priorities.length,
    pm_templates: templates.length,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Sub-tabs */}
      <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
        {SUBTABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setKind(t.key)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              padding: "8px 16px",
              borderRadius: 8,
              background: kind === t.key ? "var(--gw-bg-elev)" : "transparent",
              border: "1px solid",
              borderColor: kind === t.key ? "var(--gw-border)" : "transparent",
              fontSize: 13,
              fontWeight: 700,
              color: kind === t.key ? "var(--gw-fg)" : "var(--gw-fg-muted)",
              cursor: "pointer",
            }}
          >
            {t.label}
            {counts[t.key] > 0 && (
              <span
                style={{
                  background: "var(--gw-bg)",
                  color: "var(--gw-fg-muted)",
                  border: "1px solid var(--gw-border)",
                  fontSize: 10,
                  fontWeight: 800,
                  borderRadius: 100,
                  padding: "1px 6px",
                  lineHeight: 1.6,
                }}
              >
                {counts[t.key]}
              </span>
            )}
          </button>
        ))}
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
      ) : kind === "areas" ? (
        areas.length === 0 ? (
          <EmptyDeleted label="No deleted areas." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {areas.map((a) => (
              <DeletedRow
                key={a.id}
                title={a.name}
                subtitle={`Sort order ${a.sort_order} · deleted ${formatDate(a.deleted_at)}`}
                acting={acting === a.id}
                onRestore={() => restore("areas", a.id)}
                onHardDelete={() => hardDelete("areas", a.id, a.name)}
              />
            ))}
          </div>
        )
      ) : kind === "priorities" ? (
        priorities.length === 0 ? (
          <EmptyDeleted label="No deleted priorities." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {priorities.map((p) => (
              <DeletedRow
                key={p.id}
                title={p.label}
                subtitle={`Key ${p.key} · severity ${p.severity} · deleted ${formatDate(p.deleted_at)}`}
                chip={<span className={`rsd-chip ${p.chip_class}`}>{p.label}</span>}
                acting={acting === p.id}
                onRestore={() => restore("priorities", p.id)}
                onHardDelete={() => hardDelete("priorities", p.id, p.label)}
              />
            ))}
          </div>
        )
      ) : templates.length === 0 ? (
        <EmptyDeleted label="No deleted PM templates." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {templates.map((t) => {
            const cascadeWarning =
              t.instance_count > 0
                ? `Delete-forever will also remove ${t.instance_count} PM instance${t.instance_count === 1 ? "" : "s"} generated from this template (and any per-asset sub-records).`
                : undefined;
            return (
              <DeletedRow
                key={t.id}
                title={t.title}
                subtitle={`${describeSchedule(t.schedule_kind, t.schedule_value)} · ${t.instance_count} instance${t.instance_count === 1 ? "" : "s"} · deleted ${formatDate(t.deleted_at)}`}
                acting={acting === t.id}
                onRestore={() => restore("pm_templates", t.id)}
                onHardDelete={() => hardDelete("pm_templates", t.id, t.title, cascadeWarning)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function describeSchedule(kind: string, value: number): string {
  if (kind === "monthly_day") return `Monthly day ${value}`;
  if (kind === "weekly_day") {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return `Weekly ${days[Math.max(0, Math.min(6, value))]}`;
  }
  if (kind === "after_completion_days") return `${value}d after last done`;
  return "Schedule unknown";
}

function DeletedRow({
  title,
  subtitle,
  chip,
  acting,
  onRestore,
  onHardDelete,
}: {
  title: string;
  subtitle: string;
  chip?: React.ReactNode;
  acting: boolean;
  onRestore: () => void;
  onHardDelete: () => void;
}) {
  return (
    <div
      className="rsd-card"
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        padding: "12px 18px",
        opacity: acting ? 0.5 : 1,
        transition: "opacity 150ms",
      }}
    >
      {chip}
      <div style={{ flex: 1, minWidth: 0 }}>
        {!chip && (
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--gw-fg)", lineHeight: 1.2 }}>
            {title}
          </div>
        )}
        <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 500, marginTop: chip ? 0 : 2 }}>
          {subtitle}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        <button
          onClick={onRestore}
          disabled={acting}
          style={{
            padding: "6px 14px",
            borderRadius: 8,
            background: "var(--gw-bg-elev)",
            color: "var(--gw-fg)",
            border: "1px solid var(--gw-border)",
            fontSize: 12,
            fontWeight: 700,
            cursor: acting ? "not-allowed" : "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Icons.Undo width={12} height={12} /> Restore
        </button>
        <button
          onClick={onHardDelete}
          disabled={acting}
          style={{
            padding: "6px 14px",
            borderRadius: 8,
            background: "var(--gw-error-bg)",
            color: "var(--gw-error)",
            border: "1px solid rgba(229,62,62,.25)",
            fontSize: 12,
            fontWeight: 700,
            cursor: acting ? "not-allowed" : "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Icons.AlertTriangle width={12} height={12} /> Delete forever
        </button>
      </div>
    </div>
  );
}

function EmptyDeleted({ label }: { label: string }) {
  return (
    <div className="rsd-card" style={{ textAlign: "center", padding: "40px 24px" }}>
      <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>{label}</div>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
