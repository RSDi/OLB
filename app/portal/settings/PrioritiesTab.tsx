"use client";
import { useState, useEffect, useCallback } from "react";
import { Icons } from "../../components/icons";
import { Input, Pill, Select } from "../../components/ui";
import { createClient } from "../../../lib/supabase/client";
import type { MemberLike } from "../../../lib/auth/permissions";
import { canDeletePriorities } from "../../../lib/auth/permissions";

interface Priority {
  id: string;
  key: string;
  label: string;
  severity: number;
  chip_class: string;
}

const CHIP_OPTIONS: { value: string; label: string }[] = [
  { value: "rsd-chip-success", label: "Green (low)" },
  { value: "rsd-chip-mute", label: "Gray (neutral)" },
  { value: "rsd-chip-accent", label: "Rose (accent)" },
  { value: "rsd-chip-warn", label: "Amber (warn)" },
  { value: "rsd-chip-error", label: "Red (urgent)" },
];

export function PrioritiesTab({ me }: { me: MemberLike }) {
  const [items, setItems] = useState<Priority[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canDelete = canDeletePriorities(me);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error: loadError } = await supabase
      .from("priorities")
      .select("id, key, label, severity, chip_class")
      .is("deleted_at", null)
      .order("severity", { ascending: false })
      .order("label", { ascending: true });
    if (loadError) setError(loadError.message);
    else setItems((data as Priority[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function add(values: PriorityFormValues) {
    setError(null);
    const supabase = createClient();
    const { error: insertError } = await supabase.from("priorities").insert(values);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setAdding(false);
    await load();
  }

  async function update(id: string, values: Omit<PriorityFormValues, "key">) {
    setError(null);
    setActing(id);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("priorities")
      .update(values)
      .eq("id", id);
    if (updateError) {
      setError(updateError.message);
      setActing(null);
      return;
    }
    setEditingId(null);
    await load();
    setActing(null);
  }

  async function softDelete(id: string, label: string) {
    if (!confirm(`Move "${label}" to the deleted bin? It will no longer appear in the request form.`)) return;
    setError(null);
    setActing(id);
    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from("priorities")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (deleteError) setError(deleteError.message);
    else await load();
    setActing(null);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500, maxWidth: 440 }}>
          Priorities show on each ticket. Higher severity sorts to the top. <em>Key</em> is the internal identifier — fixed after creation.
        </div>
        {!adding && (
          <Pill variant="accent" size="sm" onClick={() => setAdding(true)}>
            <Icons.Plus width={14} height={14} /> Add priority
          </Pill>
        )}
      </div>

      {error && <ErrorBanner message={error} />}

      {adding && (
        <PriorityForm
          mode="create"
          submitLabel="Add priority"
          onCancel={() => {
            setAdding(false);
            setError(null);
          }}
          onSubmit={add}
        />
      )}

      {loading ? (
        <div style={{ padding: "40px 0", textAlign: "center", color: "var(--gw-fg-muted)", fontSize: 13 }}>
          Loading…
        </div>
      ) : items.length === 0 ? (
        <div className="rsd-card" style={{ textAlign: "center", padding: "40px 24px" }}>
          <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>No priorities yet.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((p) =>
            editingId === p.id ? (
              <PriorityForm
                key={p.id}
                mode="edit"
                initial={p}
                submitLabel="Save"
                onCancel={() => {
                  setEditingId(null);
                  setError(null);
                }}
                onSubmit={(values) => update(p.id, values)}
              />
            ) : (
              <PriorityRow
                key={p.id}
                item={p}
                acting={acting === p.id}
                canDelete={canDelete}
                onEdit={() => {
                  setEditingId(p.id);
                  setError(null);
                }}
                onDelete={() => softDelete(p.id, p.label)}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}

function PriorityRow({
  item,
  acting,
  canDelete,
  onEdit,
  onDelete,
}: {
  item: Priority;
  acting: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
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
      <span className={`rsd-chip ${item.chip_class}`}>{item.label}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
          <code style={{ fontFamily: "inherit" }}>{item.key}</code> · severity {item.severity}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        <IconBtn onClick={onEdit} disabled={acting} title="Edit">
          <Icons.Pencil width={14} height={14} />
        </IconBtn>
        {canDelete && (
          <IconBtn onClick={onDelete} disabled={acting} title="Delete" danger>
            <Icons.Trash width={14} height={14} />
          </IconBtn>
        )}
      </div>
    </div>
  );
}

interface PriorityFormValues {
  key: string;
  label: string;
  severity: number;
  chip_class: string;
}

function PriorityForm(props: {
  mode: "create";
  submitLabel: string;
  onSubmit: (values: PriorityFormValues) => void | Promise<void>;
  onCancel: () => void;
} | {
  mode: "edit";
  initial: Priority;
  submitLabel: string;
  onSubmit: (values: Omit<PriorityFormValues, "key">) => void | Promise<void>;
  onCancel: () => void;
}) {
  const isEdit = props.mode === "edit";
  const [key, setKey] = useState(isEdit ? props.initial.key : "");
  const [label, setLabel] = useState(isEdit ? props.initial.label : "");
  const [severity, setSeverity] = useState(String(isEdit ? props.initial.severity : 0));
  const [chipClass, setChipClass] = useState(isEdit ? props.initial.chip_class : "rsd-chip-mute");
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmedLabel = label.trim();
    if (!trimmedLabel) return;
    const sev = Number(severity) || 0;
    setPending(true);
    if (props.mode === "create") {
      const trimmedKey = key.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_");
      if (!trimmedKey) {
        setPending(false);
        return;
      }
      await props.onSubmit({ key: trimmedKey, label: trimmedLabel, severity: sev, chip_class: chipClass });
    } else {
      await props.onSubmit({ label: trimmedLabel, severity: sev, chip_class: chipClass });
    }
    setPending(false);
  }

  return (
    <form onSubmit={handleSubmit} className="rsd-card" style={{ gap: 14, padding: "16px 18px" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
        }}
      >
        <Input
          label="Label"
          name="label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Urgent"
          autoFocus
          required
        />
        <Input
          label={isEdit ? "Key (fixed)" : "Key"}
          name="key"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="e.g. urgent"
          disabled={isEdit}
          required
        />
        <Input
          label="Severity"
          name="severity"
          type="number"
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
        />
        <Select
          label="Chip color"
          name="chip_class"
          value={chipClass}
          onChange={(e) => setChipClass(e.target.value)}
        >
          {CHIP_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
        <span className={`rsd-chip ${chipClass}`}>{label || "Preview"}</span>
        <div style={{ display: "flex", gap: 8 }}>
          <Pill variant="ghost" size="sm" onClick={props.onCancel} disabled={pending}>
            Cancel
          </Pill>
          <Pill
            variant="accent"
            size="sm"
            type="submit"
            disabled={pending || !label.trim() || (!isEdit && !key.trim())}
          >
            {pending ? "Saving…" : props.submitLabel}
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
  const color = danger ? "var(--gw-error)" : "var(--gw-fg-muted)";
  const bg = danger ? "var(--gw-error-bg)" : "var(--gw-bg-elev)";
  return (
    <button
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
