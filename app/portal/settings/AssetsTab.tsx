"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Icons } from "../../components/icons";
import { Input, Pill, Select, Textarea } from "../../components/ui";
import { createClient } from "../../../lib/supabase/client";
import {
  createAsset,
  updateAsset,
  softDeleteAsset,
} from "../../../lib/pm/asset-actions";
import type { MemberLike } from "../../../lib/auth/permissions";
import { isSuperAdmin } from "../../../lib/auth/permissions";

interface Area {
  id: string;
  name: string;
}

interface Asset {
  id: string;
  name: string;
  area_id: string | null;
  type: string | null;
  notes: string | null;
  area: { name: string } | null;
}

export function AssetsTab({ me }: { me: MemberLike }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canDelete = isSuperAdmin(me);
  const existingTypes = Array.from(
    new Set(assets.map((a) => a.type).filter((t): t is string => Boolean(t)))
  ).sort();

  const load = useCallback(async () => {
    const supabase = createClient();
    const [{ data: assetRows, error: assetErr }, { data: areaRows }] = await Promise.all([
      supabase
        .from("assets")
        .select("id, name, area_id, type, notes, area:areas(name)")
        .is("deleted_at", null)
        .order("name", { ascending: true }),
      supabase
        .from("areas")
        .select("id, name")
        .is("deleted_at", null)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
    ]);
    if (assetErr) setError(assetErr.message);
    else setAssets((assetRows as unknown as Asset[]) ?? []);
    setAreas((areaRows as Area[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAdd(input: AssetFormValues) {
    setError(null);
    const result = await createAsset({
      name: input.name,
      areaId: input.areaId || null,
      type: input.type || null,
      notes: input.notes || null,
      attributes: {},
    });
    if (result.error) {
      setError(result.error);
      return;
    }
    setAdding(false);
    await load();
  }

  async function handleUpdate(id: string, input: AssetFormValues) {
    setError(null);
    setActing(id);
    const result = await updateAsset(id, {
      name: input.name,
      areaId: input.areaId || null,
      type: input.type || null,
      notes: input.notes || null,
      attributes: {},
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
    if (!confirm(`Move "${name}" to the deleted bin? It won't appear in PM templates anymore.`)) {
      return;
    }
    setError(null);
    setActing(id);
    const result = await softDeleteAsset(id);
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
          Assets are physical things you maintain — HVAC units, sound boards, projectors. PM
          templates with an asset type spin off one sub-task per matching asset.
        </div>
        {!adding && (
          <Pill variant="accent" size="sm" onClick={() => setAdding(true)}>
            <Icons.Plus width={14} height={14} /> Add asset
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
        <AssetForm
          areas={areas}
          existingTypes={existingTypes}
          submitLabel="Add asset"
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
      ) : assets.length === 0 ? (
        <div className="rsd-card" style={{ textAlign: "center", padding: "40px 24px" }}>
          <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>No assets yet.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {assets.map((a) =>
            editingId === a.id ? (
              <AssetForm
                key={a.id}
                areas={areas}
                existingTypes={existingTypes}
                initial={{
                  name: a.name,
                  areaId: a.area_id ?? "",
                  type: a.type ?? "",
                  notes: a.notes ?? "",
                }}
                submitLabel="Save"
                onCancel={() => {
                  setEditingId(null);
                  setError(null);
                }}
                onSubmit={(input) => handleUpdate(a.id, input)}
              />
            ) : (
              <div
                key={a.id}
                className="rsd-card"
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 14,
                  padding: "12px 18px",
                  opacity: acting === a.id ? 0.5 : 1,
                  transition: "opacity 150ms",
                }}
              >
                <Link
                  href={`/portal/pm/assets/${a.id}`}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    textDecoration: "none",
                    color: "inherit",
                    display: "block",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: "var(--gw-fg)",
                      }}
                    >
                      {a.name}
                    </span>
                    {a.type && (
                      <span
                        style={{
                          padding: "2px 8px",
                          borderRadius: 100,
                          background: "var(--gw-bg)",
                          border: "1px solid var(--gw-border)",
                          fontSize: 11,
                          fontWeight: 700,
                          color: "var(--gw-fg-muted)",
                        }}
                      >
                        {a.type}
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--gw-fg-muted)",
                      fontWeight: 500,
                      marginTop: 4,
                    }}
                  >
                    {a.area?.name ?? "No area"}
                    {a.notes ? ` · ${truncate(a.notes, 80)}` : ""}
                  </div>
                </Link>
                <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center" }}>
                  <Link
                    href={`/portal/pm/assets/${a.id}`}
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: "var(--rsd-accent)",
                      textDecoration: "none",
                      padding: "6px 10px",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    Open <Icons.ChevronRight width={12} height={12} />
                  </Link>
                  <IconBtn
                    onClick={() => {
                      setEditingId(a.id);
                      setError(null);
                    }}
                    disabled={acting === a.id}
                    title="Edit"
                  >
                    <Icons.Pencil width={14} height={14} />
                  </IconBtn>
                  {canDelete && (
                    <IconBtn
                      onClick={() => handleDelete(a.id, a.name)}
                      disabled={acting === a.id}
                      title="Delete"
                      danger
                    >
                      <Icons.Trash width={14} height={14} />
                    </IconBtn>
                  )}
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

interface AssetFormValues {
  name: string;
  areaId: string;
  type: string;
  notes: string;
}

function AssetForm({
  initial,
  areas,
  existingTypes,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: AssetFormValues;
  areas: Area[];
  existingTypes: string[];
  submitLabel: string;
  onSubmit: (values: AssetFormValues) => void | Promise<void>;
  onCancel: () => void;
}) {
  const start: AssetFormValues = initial ?? { name: "", areaId: "", type: "", notes: "" };
  const [name, setName] = useState(start.name);
  const [areaId, setAreaId] = useState(start.areaId);
  const [type, setType] = useState(start.type);
  const [notes, setNotes] = useState(start.notes);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setPending(true);
    await onSubmit({ name: trimmed, areaId, type: type.trim(), notes: notes.trim() });
    setPending(false);
  }

  return (
    <form onSubmit={handleSubmit} className="rsd-card" style={{ gap: 14, padding: "16px 18px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
        <Input
          label="Name *"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. HVAC Unit 3"
          autoFocus
          required
        />
        <TypeField value={type} onChange={setType} existingTypes={existingTypes} />
      </div>
      <Select label="Area" value={areaId} onChange={(e) => setAreaId(e.target.value)}>
        <option value="">— No area —</option>
        {areas.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </Select>
      <Textarea
        label="Notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Model, filter size, serial number, anything to remember."
        rows={3}
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

const ADD_NEW_SENTINEL = "__add_new_type__";

function TypeField({
  value,
  onChange,
  existingTypes,
}: {
  value: string;
  onChange: (next: string) => void;
  existingTypes: string[];
}) {
  const [mode, setMode] = useState<"select" | "new">("select");
  const [draft, setDraft] = useState("");

  // If the asset already has a type that's not in the list (e.g. it's the
  // only asset with that type — distinct list omits it from "existingTypes"
  // because we compute from the assets array, but actually it should be
  // there since we include the current value too) — preserve it as an option.
  const typeOptions = Array.from(new Set([...existingTypes, value].filter(Boolean))).sort();

  function handleSelectChange(next: string) {
    if (next === ADD_NEW_SENTINEL) {
      setDraft("");
      setMode("new");
    } else {
      onChange(next);
    }
  }

  function commitNewType() {
    const normalized = draft
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_-]/g, "");
    if (!normalized) return;
    if (typeOptions.includes(normalized)) {
      onChange(normalized);
      setMode("select");
      return;
    }
    if (
      confirm(
        `Create new asset type "${normalized}"?\n\nFuture assets and PM templates will be able to pick it from the list.`
      )
    ) {
      onChange(normalized);
      setMode("select");
    }
  }

  if (mode === "new") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--gw-fg-muted)",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          New type
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="e.g. hvac"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitNewType();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setMode("select");
              }
            }}
            style={{
              flex: 1,
              height: 42,
              padding: "0 14px",
              border: "1px solid var(--rsd-accent)",
              borderRadius: 8,
              fontSize: 14,
              color: "var(--gw-fg)",
              background: "var(--gw-bg)",
              outline: "none",
            }}
          />
          <button
            type="button"
            onClick={commitNewType}
            disabled={!draft.trim()}
            style={{
              padding: "0 14px",
              borderRadius: 8,
              background: "var(--rsd-accent)",
              color: "var(--rsd-accent-on)",
              border: "1px solid var(--rsd-accent)",
              fontSize: 13,
              fontWeight: 700,
              cursor: !draft.trim() ? "not-allowed" : "pointer",
              opacity: !draft.trim() ? 0.5 : 1,
            }}
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => setMode("select")}
            style={{
              padding: "0 14px",
              borderRadius: 8,
              background: "var(--gw-bg-elev)",
              color: "var(--gw-fg)",
              border: "1px solid var(--gw-border)",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
        <span style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
          Stored lowercase with underscores. You&apos;ll confirm before it&apos;s created.
        </span>
      </div>
    );
  }

  return (
    <Select label="Type" value={value} onChange={(e) => handleSelectChange(e.target.value)}>
      <option value="">— No type —</option>
      {typeOptions.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
      <option value={ADD_NEW_SENTINEL}>+ Add new type…</option>
    </Select>
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

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + "…";
}
