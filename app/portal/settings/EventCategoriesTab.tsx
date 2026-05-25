"use client";
import { useState, useEffect, useCallback } from "react";
import { Icons } from "../../components/icons";
import { Input, Pill, Select } from "../../components/ui";
import { createClient } from "../../../lib/supabase/client";
import {
  createEventCategory,
  updateEventCategory,
  softDeleteEventCategory,
} from "../../../lib/events/category-actions";
import type { MemberLike } from "../../../lib/auth/permissions";
import { isSuperAdmin } from "../../../lib/auth/permissions";

interface EventCategory {
  id: string;
  name: string;
  chip_class: string;
  sort_order: number;
}

const CHIP_OPTIONS: { value: string; label: string }[] = [
  { value: "rsd-chip-accent", label: "Rose (accent)" },
  { value: "rsd-chip-success", label: "Green (positive)" },
  { value: "rsd-chip-warn", label: "Amber (warn)" },
  { value: "rsd-chip-error", label: "Red (urgent)" },
  { value: "rsd-chip-mute", label: "Gray (neutral)" },
];

export function EventCategoriesTab({ me }: { me: MemberLike }) {
  const [rows, setRows] = useState<EventCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canDelete = isSuperAdmin(me);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error: loadError } = await supabase
      .from("event_categories")
      .select("id, name, chip_class, sort_order")
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (loadError) setError(loadError.message);
    else setRows((data as EventCategory[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAdd(values: CategoryFormValues) {
    setError(null);
    const result = await createEventCategory({
      name: values.name,
      chipClass: values.chipClass,
      sortOrder: values.sortOrder,
    });
    if (result.error) {
      setError(result.error);
      return;
    }
    setAdding(false);
    await load();
  }

  async function handleUpdate(id: string, values: CategoryFormValues) {
    setError(null);
    setActing(id);
    const result = await updateEventCategory(id, {
      name: values.name,
      chipClass: values.chipClass,
      sortOrder: values.sortOrder,
    });
    if (result.error) {
      setError(result.error);
      setActing(null);
      return;
    }
    setEditingId(null);
    await load();
    setActing(null);
  }

  async function handleDelete(id: string, name: string) {
    if (
      !confirm(
        `Move "${name}" to the deleted bin? Events using it lose their grouping (they aren't deleted).`
      )
    ) {
      return;
    }
    setError(null);
    setActing(id);
    const result = await softDeleteEventCategory(id);
    if (result.error) setError(result.error);
    else await load();
    setActing(null);
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
          Categories appear in the dropdown when creating an event and drive the chip color on
          the events list and dashboard.
        </div>
        {!adding && (
          <Pill variant="accent" size="sm" onClick={() => setAdding(true)}>
            <Icons.Plus width={14} height={14} /> Add category
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
        <CategoryForm
          submitLabel="Add category"
          onCancel={() => {
            setAdding(false);
            setError(null);
          }}
          onSubmit={handleAdd}
        />
      )}

      {loading ? (
        <div style={{ padding: "40px 0", textAlign: "center", color: "var(--gw-fg-muted)", fontSize: 13 }}>
          Loading…
        </div>
      ) : rows.length === 0 ? (
        <div className="rsd-card" style={{ textAlign: "center", padding: "40px 24px" }}>
          <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
            No event categories yet.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map((c) =>
            editingId === c.id ? (
              <CategoryForm
                key={c.id}
                initial={{ name: c.name, chipClass: c.chip_class, sortOrder: c.sort_order }}
                submitLabel="Save"
                onCancel={() => {
                  setEditingId(null);
                  setError(null);
                }}
                onSubmit={(values) => handleUpdate(c.id, values)}
              />
            ) : (
              <CategoryRow
                key={c.id}
                category={c}
                acting={acting === c.id}
                canDelete={canDelete}
                onEdit={() => {
                  setEditingId(c.id);
                  setError(null);
                }}
                onDelete={() => handleDelete(c.id, c.name)}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}

function CategoryRow({
  category,
  acting,
  canDelete,
  onEdit,
  onDelete,
}: {
  category: EventCategory;
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
      <span className={`rsd-chip ${category.chip_class}`}>{category.name}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
          Sort order: {category.sort_order}
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

interface CategoryFormValues {
  name: string;
  chipClass: string;
  sortOrder: number;
}

function CategoryForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: CategoryFormValues;
  submitLabel: string;
  onSubmit: (values: CategoryFormValues) => void | Promise<void>;
  onCancel: () => void;
}) {
  const start: CategoryFormValues =
    initial ?? { name: "", chipClass: "rsd-chip-accent", sortOrder: 100 };
  const [name, setName] = useState(start.name);
  const [chipClass, setChipClass] = useState(start.chipClass);
  const [sortOrder, setSortOrder] = useState(String(start.sortOrder));
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return;
    setPending(true);
    await onSubmit({
      name: name.trim(),
      chipClass,
      sortOrder: Number(sortOrder) || 100,
    });
    setPending(false);
  }

  return (
    <form onSubmit={handleSubmit} className="rsd-card" style={{ gap: 14, padding: "16px 18px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
        <Input
          label="Name *"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Bible Study"
          autoFocus
          required
        />
        <Input
          label="Sort order"
          type="number"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
        />
      </div>
      <Select
        label="Chip color"
        value={chipClass}
        onChange={(e) => setChipClass(e.target.value)}
      >
        {CHIP_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
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
