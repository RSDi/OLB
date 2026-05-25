"use client";
import { useState, useEffect, useCallback, useTransition } from "react";
import { Icons } from "../../components/icons";
import { Pill } from "../../components/ui";
import { createClient } from "../../../lib/supabase/client";
import {
  renameAssetType,
  clearAssetType,
} from "../../../lib/pm/asset-actions";

interface TypeRow {
  type: string;
  count: number;
}

export function TypesTab() {
  const [rows, setRows] = useState<TypeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingType, setEditingType] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(async () => {
    setError(null);
    const supabase = createClient();
    const { data, error: loadError } = await supabase
      .from("assets")
      .select("type")
      .is("deleted_at", null)
      .not("type", "is", null);
    if (loadError) {
      setError(loadError.message);
    } else {
      const counts = new Map<string, number>();
      for (const r of (data as { type: string | null }[]) ?? []) {
        if (!r.type) continue;
        counts.set(r.type, (counts.get(r.type) ?? 0) + 1);
      }
      setRows(
        Array.from(counts.entries())
          .map(([type, count]) => ({ type, count }))
          .sort((a, b) => a.type.localeCompare(b.type))
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function startEditing(type: string) {
    setEditingType(type);
    setDraftName(type);
    setError(null);
  }

  function cancelEditing() {
    setEditingType(null);
    setDraftName("");
    setError(null);
  }

  function commitRename(oldType: string) {
    const normalized = draftName
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_-]/g, "");
    if (!normalized) {
      setError("New name cannot be empty.");
      return;
    }
    if (normalized === oldType) {
      cancelEditing();
      return;
    }
    const existing = rows.find((r) => r.type === normalized);
    const proceed = existing
      ? confirm(
          `"${normalized}" already exists with ${existing.count} asset${existing.count === 1 ? "" : "s"}. Merge "${oldType}" into it?\n\nThe ${rows.find((r) => r.type === oldType)?.count ?? 0} asset${rows.find((r) => r.type === oldType)?.count === 1 ? "" : "s"} currently using "${oldType}" will be retyped to "${normalized}".`
        )
      : confirm(`Rename "${oldType}" to "${normalized}" on every matching asset?`);
    if (!proceed) return;

    setActing(oldType);
    startTransition(async () => {
      const result = await renameAssetType(oldType, normalized);
      if (result.error) {
        setError(result.error);
        setActing(null);
        return;
      }
      cancelEditing();
      await load();
      setActing(null);
    });
  }

  function handleClear(type: string, count: number) {
    if (
      !confirm(
        `Clear the type from ${count} asset${count === 1 ? "" : "s"}? They stay registered but lose their "${type}" grouping. PM templates filtered by "${type}" will no longer match them.`
      )
    ) {
      return;
    }
    setError(null);
    setActing(type);
    startTransition(async () => {
      const result = await clearAssetType(type);
      if (result.error) {
        setError(result.error);
        setActing(null);
        return;
      }
      await load();
      setActing(null);
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500, maxWidth: 540 }}>
        Types are emergent from your assets — they appear here automatically once an asset uses
        them. Rename to fix typos or merge two variants. Clear removes the grouping from every
        asset without deleting the assets themselves.
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
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--gw-fg)", marginBottom: 6 }}>
            No types in use yet
          </div>
          <div style={{ fontSize: 13, color: "var(--gw-fg-muted)" }}>
            Add a type to any asset on the Assets tab and it&apos;ll show up here.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map((r) => (
            <div
              key={r.type}
              className="rsd-card"
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 14,
                padding: "12px 18px",
                opacity: acting === r.type ? 0.5 : 1,
                transition: "opacity 150ms",
              }}
            >
              {editingType === r.type ? (
                <div style={{ display: "flex", flex: 1, gap: 8, alignItems: "center" }}>
                  <input
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitRename(r.type);
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        cancelEditing();
                      }
                    }}
                    style={{
                      flex: 1,
                      height: 36,
                      padding: "0 12px",
                      border: "1px solid var(--rsd-accent)",
                      borderRadius: 8,
                      fontSize: 14,
                      background: "var(--gw-bg)",
                      color: "var(--gw-fg)",
                    }}
                  />
                  <Pill
                    variant="accent"
                    size="sm"
                    onClick={() => commitRename(r.type)}
                    disabled={pending || !draftName.trim()}
                  >
                    {pending ? "Saving…" : "Rename"}
                  </Pill>
                  <Pill variant="ghost" size="sm" onClick={cancelEditing} disabled={pending}>
                    Cancel
                  </Pill>
                </div>
              ) : (
                <>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span
                        style={{
                          padding: "3px 10px",
                          borderRadius: 100,
                          background: "var(--gw-bg)",
                          border: "1px solid var(--gw-border)",
                          fontSize: 13,
                          fontWeight: 700,
                          color: "var(--gw-fg)",
                          fontFamily: "inherit",
                        }}
                      >
                        {r.type}
                      </span>
                      <span style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
                        {r.count} {r.count === 1 ? "asset" : "assets"}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => startEditing(r.type)}
                      disabled={acting === r.type}
                      style={{
                        padding: "6px 14px",
                        borderRadius: 8,
                        background: "var(--gw-bg-elev)",
                        color: "var(--gw-fg)",
                        border: "1px solid var(--gw-border)",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: acting === r.type ? "not-allowed" : "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <Icons.Pencil width={12} height={12} /> Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => handleClear(r.type, r.count)}
                      disabled={acting === r.type}
                      style={{
                        padding: "6px 14px",
                        borderRadius: 8,
                        background: "var(--gw-error-bg)",
                        color: "var(--gw-error)",
                        border: "1px solid rgba(229,62,62,.25)",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: acting === r.type ? "not-allowed" : "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <Icons.Trash width={12} height={12} /> Clear
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
