"use client";
import { useState, useTransition } from "react";
import { Icons } from "../../../../components/icons";
import { Input, Pill, Select } from "../../../../components/ui";
import {
  linkSupplyToAsset,
  unlinkSupplyFromAsset,
} from "../../../../../lib/supplies/actions";

interface Supply {
  id: string;
  name: string;
  unit: string;
  on_hand: number;
}

export interface AssetSupplyLink {
  id: string;
  supply_id: string;
  qty_per_use: number;
  supply: Supply | null;
}

export function AssetSuppliesPanel({
  assetId,
  links,
  allSupplies,
}: {
  assetId: string;
  links: AssetSupplyLink[];
  allSupplies: Supply[];
}) {
  const [adding, setAdding] = useState(false);
  const [supplyId, setSupplyId] = useState("");
  const [qty, setQty] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const linkedIds = new Set(links.map((l) => l.supply_id));
  const available = allSupplies.filter((s) => !linkedIds.has(s.id));

  function handleAdd() {
    if (!supplyId) {
      setError("Pick a supply.");
      return;
    }
    const q = Number(qty);
    if (!Number.isFinite(q) || q <= 0) {
      setError("Qty per use must be a positive number.");
      return;
    }
    setError(null);
    setActing(supplyId);
    startTransition(async () => {
      const result = await linkSupplyToAsset(assetId, supplyId, q, null);
      if (result.error) {
        setError(result.error);
        setActing(null);
        return;
      }
      setAdding(false);
      setSupplyId("");
      setQty("1");
      setActing(null);
    });
  }

  function handleRemove(link: AssetSupplyLink) {
    if (!confirm(`Stop tracking "${link.supply?.name ?? "this supply"}" for this asset?`)) return;
    setError(null);
    setActing(link.supply_id);
    startTransition(async () => {
      const result = await unlinkSupplyFromAsset(assetId, link.supply_id);
      if (result.error) setError(result.error);
      setActing(null);
    });
  }

  return (
    <div className="rsd-card" style={{ gap: 12 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: 13,
            fontWeight: 700,
            color: "var(--gw-fg-muted)",
            textTransform: "uppercase",
            letterSpacing: ".04em",
          }}
        >
          Supplies
        </h3>
        {!adding && available.length > 0 && (
          <Pill variant="ghost" size="sm" onClick={() => setAdding(true)}>
            <Icons.Plus width={12} height={12} /> Link supply
          </Pill>
        )}
      </div>

      {error && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 12,
            color: "var(--gw-error)",
            fontWeight: 600,
          }}
        >
          <Icons.AlertCircle width={12} height={12} /> {error}
        </div>
      )}

      {links.length === 0 && !adding ? (
        <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
          No supplies linked. Link a filter, bulb, or other part this asset consumes during
          maintenance.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {links.map((link) => (
            <div
              key={link.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 10px",
                background: "var(--gw-bg)",
                border: "1px solid var(--gw-border)",
                borderRadius: 8,
                opacity: acting === link.supply_id ? 0.5 : 1,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--gw-fg)" }}>
                  {link.supply?.name ?? "(deleted supply)"}
                </div>
                <div style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 500, marginTop: 2 }}>
                  {formatQty(link.qty_per_use)} {link.supply?.unit ?? ""}
                  {Number(link.qty_per_use) === 1 ? "" : "s"} per use
                  {link.supply && (
                    <>
                      {" · "}
                      <span>
                        {formatQty(link.supply.on_hand)} on hand
                      </span>
                    </>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleRemove(link)}
                disabled={acting === link.supply_id}
                title="Unlink"
                style={{
                  width: 26,
                  height: 26,
                  padding: 0,
                  borderRadius: 6,
                  background: "var(--gw-bg-elev)",
                  color: "var(--gw-fg-muted)",
                  border: "1px solid var(--gw-border)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: acting === link.supply_id ? "not-allowed" : "pointer",
                }}
              >
                <Icons.X width={11} height={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            paddingTop: 10,
            borderTop: "1px solid var(--gw-border)",
          }}
        >
          <Select
            label="Supply"
            value={supplyId}
            onChange={(e) => setSupplyId(e.target.value)}
          >
            <option value="">— Pick a supply —</option>
            {available.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <div style={{ width: 110 }}>
              <Input
                label="Qty per use"
                type="number"
                min={0}
                step="0.01"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </div>
            <div style={{ flex: 1, display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Pill
                variant="ghost"
                size="sm"
                onClick={() => {
                  setAdding(false);
                  setError(null);
                }}
                disabled={pending}
              >
                Cancel
              </Pill>
              <Pill variant="accent" size="sm" onClick={handleAdd} disabled={pending || !supplyId}>
                {pending ? "Linking…" : "Link"}
              </Pill>
            </div>
          </div>
        </div>
      )}

      {available.length === 0 && links.length === allSupplies.length && allSupplies.length > 0 && !adding && (
        <div style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 500, fontStyle: "italic" }}>
          All registered supplies are already linked.
        </div>
      )}
    </div>
  );
}

function formatQty(n: number): string {
  const num = Number(n);
  return Number.isInteger(num) ? String(num) : num.toFixed(2);
}
