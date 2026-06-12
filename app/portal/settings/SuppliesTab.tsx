"use client";
import { useState, useEffect, useCallback } from "react";
import { Icons } from "../../components/icons";
import { Input, Pill, Select, Textarea } from "../../components/ui";
import { createClient } from "../../../lib/supabase/client";
import {
  createSupply,
  updateSupply,
  softDeleteSupply,
} from "../../../lib/supplies/actions";
import type { MemberLike } from "../../../lib/auth/permissions";
import { isSuperAdmin } from "../../../lib/auth/permissions";

interface Supply {
  id: string;
  name: string;
  unit: string;
  on_hand: number;
  reorder_threshold: number;
  notes: string | null;
  reorder_contact_id: string | null;
  reorder_note: string | null;
  vendor: { name: string } | null;
}

interface VendorOption {
  id: string;
  name: string;
}

export function SuppliesTab({ me }: { me: MemberLike }) {
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vendors, setVendors] = useState<VendorOption[]>([]);

  const canDelete = isSuperAdmin(me);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [{ data, error: loadError }, { data: contactRows }] = await Promise.all([
      supabase
        .from("supplies")
        .select(
          "id, name, unit, on_hand, reorder_threshold, notes, reorder_contact_id, reorder_note, vendor:contacts!reorder_contact_id(name)"
        )
        .is("deleted_at", null)
        .order("name", { ascending: true }),
      supabase
        .from("contacts")
        .select("id, name")
        .is("deleted_at", null)
        .order("name", { ascending: true }),
    ]);
    if (loadError) setError(loadError.message);
    else setSupplies(((data as unknown as Supply[]) ?? []).map(numerify));
    setVendors((contactRows as VendorOption[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAdd(values: SupplyFormValues) {
    setError(null);
    const result = await createSupply({
      name: values.name,
      unit: values.unit,
      onHand: values.onHand,
      reorderThreshold: values.reorderThreshold,
      notes: values.notes || null,
      reorderContactId: values.reorderContactId || null,
      reorderNote: values.reorderNote || null,
    });
    if (result.error) {
      setError(result.error);
      return;
    }
    setAdding(false);
    await load();
  }

  async function handleUpdate(id: string, values: SupplyFormValues) {
    setError(null);
    setActing(id);
    const result = await updateSupply(id, {
      name: values.name,
      unit: values.unit,
      onHand: values.onHand,
      reorderThreshold: values.reorderThreshold,
      notes: values.notes || null,
      reorderContactId: values.reorderContactId || null,
      reorderNote: values.reorderNote || null,
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
    if (!confirm(`Move "${name}" to the deleted bin? Existing usage history stays.`)) return;
    setError(null);
    setActing(id);
    const result = await softDeleteSupply(id);
    if (result.error) setError(result.error);
    else await load();
    setActing(null);
  }

  const lowStock = supplies.filter(isLowStock);

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
          Stock of parts the church keeps on hand — filters, bulbs, gaskets, etc. PM tasks can be
          configured to consume supplies during completion, which decrements the on-hand count.
        </div>
        {!adding && (
          <Pill variant="accent" size="sm" onClick={() => setAdding(true)}>
            <Icons.Plus width={14} height={14} /> Add supply
          </Pill>
        )}
      </div>

      {error && <ErrorBanner message={error} />}

      {lowStock.length > 0 && (
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
          <Icons.AlertTriangle width={16} height={16} />
          {lowStock.length} suppl{lowStock.length === 1 ? "y is" : "ies are"} at or below reorder
          threshold.
        </div>
      )}

      {adding && (
        <SupplyForm
          submitLabel="Add supply"
          vendors={vendors}
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
      ) : supplies.length === 0 ? (
        <div className="rsd-card" style={{ textAlign: "center", padding: "40px 24px" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--gw-fg)", marginBottom: 6 }}>
            No supplies yet
          </div>
          <div style={{ fontSize: 13, color: "var(--gw-fg-muted)" }}>
            Add a supply to start tracking inventory.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {supplies.map((s) =>
            editingId === s.id ? (
              <SupplyForm
                key={s.id}
                initial={{
                  name: s.name,
                  unit: s.unit,
                  onHand: s.on_hand,
                  reorderThreshold: s.reorder_threshold,
                  notes: s.notes ?? "",
                  reorderContactId: s.reorder_contact_id ?? "",
                  reorderNote: s.reorder_note ?? "",
                }}
                vendors={vendors}
                submitLabel="Save"
                onCancel={() => {
                  setEditingId(null);
                  setError(null);
                }}
                onSubmit={(values) => handleUpdate(s.id, values)}
              />
            ) : (
              <SupplyRow
                key={s.id}
                supply={s}
                acting={acting === s.id}
                canDelete={canDelete}
                onEdit={() => {
                  setEditingId(s.id);
                  setError(null);
                }}
                onDelete={() => handleDelete(s.id, s.name)}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}

function SupplyRow({
  supply,
  acting,
  canDelete,
  onEdit,
  onDelete,
}: {
  supply: Supply;
  acting: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const low = isLowStock(supply);
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
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--gw-fg)" }}>{supply.name}</span>
          {low && <span className="rsd-chip rsd-chip-error">Low stock</span>}
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--gw-fg-muted)",
            fontWeight: 500,
            marginTop: 4,
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <span>
            <strong style={{ color: "var(--gw-fg)" }}>{formatQty(supply.on_hand)}</strong> {supply.unit}
            {supply.on_hand === 1 ? "" : "s"} on hand
          </span>
          <span>·</span>
          <span>reorder at {formatQty(supply.reorder_threshold)}</span>
          {supply.vendor && (
            <>
              <span>·</span>
              <span>reorder from {supply.vendor.name}</span>
            </>
          )}
          {supply.notes && (
            <>
              <span>·</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {supply.notes}
              </span>
            </>
          )}
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

interface SupplyFormValues {
  name: string;
  unit: string;
  onHand: number;
  reorderThreshold: number;
  notes: string;
  reorderContactId: string;
  reorderNote: string;
}

function SupplyForm({
  initial,
  submitLabel,
  vendors,
  onSubmit,
  onCancel,
}: {
  initial?: SupplyFormValues;
  submitLabel: string;
  vendors: VendorOption[];
  onSubmit: (values: SupplyFormValues) => void | Promise<void>;
  onCancel: () => void;
}) {
  const start: SupplyFormValues =
    initial ?? {
      name: "", unit: "each", onHand: 0, reorderThreshold: 1, notes: "",
      reorderContactId: "", reorderNote: "",
    };
  const [name, setName] = useState(start.name);
  const [unit, setUnit] = useState(start.unit);
  const [onHand, setOnHand] = useState(String(start.onHand));
  const [reorderThreshold, setReorderThreshold] = useState(String(start.reorderThreshold));
  const [notes, setNotes] = useState(start.notes);
  const [reorderContactId, setReorderContactId] = useState(start.reorderContactId);
  const [reorderNote, setReorderNote] = useState(start.reorderNote);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return;
    setPending(true);
    await onSubmit({
      name: name.trim(),
      unit: unit.trim() || "each",
      onHand: Number(onHand) || 0,
      reorderThreshold: Number(reorderThreshold) || 0,
      notes: notes.trim(),
      reorderContactId,
      reorderNote: reorderNote.trim(),
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
          placeholder="e.g. 16x25x1 Furnace Filter"
          autoFocus
          required
        />
        <Input
          label="Unit"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          placeholder="each, bottle, roll"
        />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Input
          label="On hand"
          type="number"
          min={0}
          step="0.01"
          value={onHand}
          onChange={(e) => setOnHand(e.target.value)}
        />
        <Input
          label="Reorder threshold"
          type="number"
          min={0}
          step="0.01"
          value={reorderThreshold}
          onChange={(e) => setReorderThreshold(e.target.value)}
        />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Select
          label="Reorder from (vendor)"
          value={reorderContactId}
          onChange={(e) => setReorderContactId(e.target.value)}
        >
          <option value="">No vendor set</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </Select>
        <Input
          label="Reorder note"
          value={reorderNote}
          onChange={(e) => setReorderNote(e.target.value)}
          placeholder="Part number, link, how many to order"
        />
      </div>
      <Textarea
        label="Notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Anything else to remember about this supply."
        rows={2}
      />
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

function numerify(s: Supply): Supply {
  return {
    ...s,
    on_hand: Number(s.on_hand),
    reorder_threshold: Number(s.reorder_threshold),
  };
}

function isLowStock(s: Supply): boolean {
  return Number(s.on_hand) <= Number(s.reorder_threshold);
}

function formatQty(n: number): string {
  const num = Number(n);
  return Number.isInteger(num) ? String(num) : num.toFixed(2);
}
