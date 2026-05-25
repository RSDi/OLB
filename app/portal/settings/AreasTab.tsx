"use client";
import { useState, useEffect, useCallback } from "react";
import { Icons } from "../../components/icons";
import { Input, Pill } from "../../components/ui";
import { createClient } from "../../../lib/supabase/client";
import type { MemberLike } from "../../../lib/auth/permissions";
import { canDeleteAreas } from "../../../lib/auth/permissions";

interface Area {
  id: string;
  name: string;
  sort_order: number;
}

export function AreasTab({ me }: { me: MemberLike }) {
  const [areas, setAreas] = useState<Area[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canDelete = canDeleteAreas(me);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error: loadError } = await supabase
      .from("areas")
      .select("id, name, sort_order")
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (loadError) {
      setError(loadError.message);
    } else {
      setAreas((data as Area[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addArea(name: string, sortOrder: number) {
    setError(null);
    const supabase = createClient();
    const { error: insertError } = await supabase
      .from("areas")
      .insert({ name, sort_order: sortOrder });
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setAdding(false);
    await load();
  }

  async function updateArea(id: string, name: string, sortOrder: number) {
    setError(null);
    setActing(id);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("areas")
      .update({ name, sort_order: sortOrder })
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

  async function softDeleteArea(id: string, name: string) {
    if (!confirm(`Move "${name}" to the deleted bin? It will no longer appear in the request form.`)) return;
    setError(null);
    setActing(id);
    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from("areas")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (deleteError) {
      setError(deleteError.message);
    } else {
      await load();
    }
    setActing(null);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500, maxWidth: 440 }}>
          Areas appear in the dropdown on the maintenance request form. Lower sort order shows first.
        </div>
        {!adding && (
          <Pill variant="accent" size="sm" onClick={() => setAdding(true)}>
            <Icons.Plus width={14} height={14} /> Add area
          </Pill>
        )}
      </div>

      {error && <ErrorBanner message={error} />}

      {adding && (
        <AreaForm
          submitLabel="Add area"
          onCancel={() => {
            setAdding(false);
            setError(null);
          }}
          onSubmit={addArea}
        />
      )}

      {loading ? (
        <div style={{ padding: "40px 0", textAlign: "center", color: "var(--gw-fg-muted)", fontSize: 13 }}>
          Loading…
        </div>
      ) : areas.length === 0 ? (
        <div className="rsd-card" style={{ textAlign: "center", padding: "40px 24px" }}>
          <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>No areas yet.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {areas.map((area) =>
            editingId === area.id ? (
              <AreaForm
                key={area.id}
                initialName={area.name}
                initialSortOrder={area.sort_order}
                submitLabel="Save"
                onCancel={() => {
                  setEditingId(null);
                  setError(null);
                }}
                onSubmit={(name, sortOrder) => updateArea(area.id, name, sortOrder)}
              />
            ) : (
              <AreaRow
                key={area.id}
                area={area}
                acting={acting === area.id}
                canDelete={canDelete}
                onEdit={() => {
                  setEditingId(area.id);
                  setError(null);
                }}
                onDelete={() => softDeleteArea(area.id, area.name)}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}

function AreaRow({
  area,
  acting,
  canDelete,
  onEdit,
  onDelete,
}: {
  area: Area;
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
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--gw-fg)", lineHeight: 1.2 }}>
          {area.name}
        </div>
        <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 500, marginTop: 2 }}>
          Sort order: {area.sort_order}
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

function AreaForm({
  initialName = "",
  initialSortOrder = 100,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initialName?: string;
  initialSortOrder?: number;
  submitLabel: string;
  onSubmit: (name: string, sortOrder: number) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [sortOrder, setSortOrder] = useState(String(initialSortOrder));
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setPending(true);
    await onSubmit(trimmed, Number(sortOrder) || 100);
    setPending(false);
  }

  return (
    <form onSubmit={handleSubmit} className="rsd-card" style={{ gap: 14, padding: "16px 18px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 12 }}>
        <Input
          label="Name"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Main Meeting Room"
          autoFocus
          required
        />
        <Input
          label="Sort order"
          name="sort_order"
          type="number"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
        />
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
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
