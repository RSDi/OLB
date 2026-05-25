"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icons } from "../../../components/icons";
import { Pill, Textarea } from "../../../components/ui";
import {
  toggleAssetStep,
  completeAssetInstance,
  skipAssetInstance,
  reopenAssetInstance,
  type InstanceStepCheck,
  type InstanceStatus,
} from "../../../../lib/pm/actions";
import { recordSupplyUsage } from "../../../../lib/supplies/actions";

interface Step {
  id: string;
  label: string;
}

export interface AssetSupplyForCompletion {
  supply_id: string;
  qty_per_use: number;
  name: string;
  unit: string;
  on_hand: number;
}

export interface AssetRow {
  id: string;
  asset_id: string;
  asset_name: string;
  asset_type: string | null;
  status: InstanceStatus;
  step_checks: InstanceStepCheck[];
  notes: string | null;
  completed_at: string | null;
  supplies: AssetSupplyForCompletion[];
}

export function AssetScopedActions({
  steps,
  assets,
}: {
  steps: Step[];
  assets: AssetRow[];
}) {
  return (
    <div className="rsd-card" style={{ gap: 0, padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--gw-border)" }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>
          {assets.length} {assets.length === 1 ? "asset" : "assets"} on this task
        </h3>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {assets.map((a, i) => (
          <AssetCard
            key={a.id}
            steps={steps}
            asset={a}
            border={i < assets.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

function AssetCard({
  steps,
  asset,
  border,
}: {
  steps: Step[];
  asset: AssetRow;
  border: boolean;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState(asset.notes ?? "");
  const [expanded, setExpanded] = useState(asset.status === "pending" || asset.status === "in_progress");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Supply qty inputs, keyed by supply_id, initialized to qty_per_use.
  const [supplyQtys, setSupplyQtys] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      asset.supplies.map((s) => [s.supply_id, String(s.qty_per_use)])
    )
  );
  const isClosed = asset.status === "done" || asset.status === "skipped";

  const checked = asset.step_checks.filter((c) => c.checked).length;
  const total = steps.length || asset.step_checks.length;

  function handleToggle(stepId: string, value: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await toggleAssetStep(asset.id, stepId, value);
      if (result.error) setError(result.error);
    });
  }

  function handleComplete() {
    const unchecked = total - checked;
    if (
      unchecked > 0 &&
      !confirm(`${unchecked} step${unchecked === 1 ? "" : "s"} still unchecked on this asset. Mark done anyway?`)
    ) {
      return;
    }
    // Collect supplies the technician actually used (qty > 0).
    const usageList = asset.supplies
      .map((s) => ({
        supplyId: s.supply_id,
        name: s.name,
        qty: Number(supplyQtys[s.supply_id] ?? "0"),
      }))
      .filter((u) => Number.isFinite(u.qty) && u.qty > 0);

    setError(null);
    startTransition(async () => {
      // Decrement inventory + write usage log for each supply BEFORE marking
      // done. If any fails we bail and leave status unchanged so the user
      // can correct and retry.
      for (const u of usageList) {
        const r = await recordSupplyUsage({
          supplyId: u.supplyId,
          qtyUsed: u.qty,
          pmInstanceAssetId: asset.id,
        });
        if (r.error) {
          setError(`Couldn't log ${u.name}: ${r.error}`);
          return;
        }
      }
      const result = await completeAssetInstance(asset.id, notes);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  function handleSkip() {
    const reason = window.prompt(`Reason for skipping ${asset.asset_name} (optional):`, notes);
    if (reason === null) return;
    setError(null);
    startTransition(async () => {
      const result = await skipAssetInstance(asset.id, reason);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  function handleReopen() {
    if (!confirm(`Reopen ${asset.asset_name}? It will move back to In Progress.`)) return;
    setError(null);
    startTransition(async () => {
      const result = await reopenAssetInstance(asset.id);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div
      style={{
        padding: "16px 18px",
        borderBottom: border ? "1px solid var(--gw-border)" : "none",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: "transparent",
          border: "none",
          padding: 0,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <Icons.ChevronRight
          width={14}
          height={14}
          style={{
            color: "var(--gw-fg-muted)",
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 120ms",
            flexShrink: 0,
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Link
              href={`/portal/pm/assets/${asset.asset_id}`}
              onClick={(e) => e.stopPropagation()}
              style={{ fontSize: 14, fontWeight: 700, color: "var(--gw-fg)", textDecoration: "none" }}
            >
              {asset.asset_name}
            </Link>
            {statusChip(asset.status)}
            {asset.asset_type && (
              <span style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 600 }}>
                {asset.asset_type}
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 500, marginTop: 2 }}>
            {checked}/{total} steps{" "}
            {asset.completed_at &&
              `· ${asset.status === "skipped" ? "skipped" : "completed"} ${formatDate(asset.completed_at)}`}
          </div>
        </div>
      </button>

      {expanded && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingLeft: 24 }}>
          {steps.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--gw-fg-muted)" }}>No checklist steps.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {steps.map((s) => {
                const c = asset.step_checks.find((x) => x.step_id === s.id);
                const isChecked = Boolean(c?.checked);
                return (
                  <label
                    key={s.id}
                    style={{
                      display: "flex",
                      gap: 10,
                      padding: "6px 0",
                      cursor: isClosed ? "default" : "pointer",
                      opacity: isClosed ? 0.7 : 1,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={isClosed || pending}
                      onChange={(e) => handleToggle(s.id, e.target.checked)}
                      style={{ width: 16, height: 16, marginTop: 2, flexShrink: 0 }}
                    />
                    <span
                      style={{
                        fontSize: 13,
                        color: "var(--gw-fg)",
                        textDecoration: isChecked ? "line-through" : "none",
                        lineHeight: 1.5,
                      }}
                    >
                      {s.label}
                    </span>
                  </label>
                );
              })}
            </div>
          )}

          {asset.supplies.length > 0 && !isClosed && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                padding: "10px 12px",
                background: "var(--gw-bg)",
                border: "1px solid var(--gw-border)",
                borderRadius: 8,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--gw-fg-muted)",
                  textTransform: "uppercase",
                  letterSpacing: ".04em",
                }}
              >
                Supplies used (qty deducts from inventory on Mark done)
              </div>
              {asset.supplies.map((s) => (
                <div
                  key={s.supply_id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span style={{ flex: 1, fontSize: 13, color: "var(--gw-fg)", fontWeight: 600 }}>
                    {s.name}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
                    {formatQty(s.on_hand)} on hand
                  </span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={supplyQtys[s.supply_id] ?? "0"}
                    onChange={(e) =>
                      setSupplyQtys((prev) => ({ ...prev, [s.supply_id]: e.target.value }))
                    }
                    disabled={pending}
                    style={{
                      width: 80,
                      height: 30,
                      padding: "0 8px",
                      border: "1px solid var(--gw-border)",
                      borderRadius: 6,
                      fontSize: 13,
                      background: "var(--gw-bg-elev)",
                      color: "var(--gw-fg)",
                    }}
                  />
                  <span style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 500, minWidth: 36 }}>
                    {s.unit}
                    {Number(supplyQtys[s.supply_id] ?? "0") === 1 ? "" : "s"}
                  </span>
                </div>
              ))}
            </div>
          )}

          <Textarea
            name={`notes-${asset.id}`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={
              isClosed
                ? "Read-only — reopen to edit"
                : "Per-asset notes (saved when you mark done or skip)."
            }
            rows={2}
            disabled={isClosed || pending}
          />

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

          <div style={{ display: "flex", gap: 8 }}>
            {isClosed ? (
              <Pill variant="ghost" size="sm" onClick={handleReopen} disabled={pending}>
                <Icons.Undo width={12} height={12} /> Reopen
              </Pill>
            ) : (
              <>
                <Pill variant="accent" size="sm" onClick={handleComplete} disabled={pending}>
                  <Icons.CheckCircle width={12} height={12} />
                  {pending ? "Saving…" : "Mark done"}
                </Pill>
                <Pill variant="ghost" size="sm" onClick={handleSkip} disabled={pending}>
                  Skip this asset
                </Pill>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function statusChip(s: InstanceStatus) {
  if (s === "pending") return <span className="rsd-chip rsd-chip-warn">Pending</span>;
  if (s === "in_progress") return <span className="rsd-chip rsd-chip-accent">In Progress</span>;
  if (s === "skipped") return <span className="rsd-chip rsd-chip-mute">Skipped</span>;
  return <span className="rsd-chip rsd-chip-success">Done</span>;
}

function formatQty(n: number): string {
  const num = Number(n);
  return Number.isInteger(num) ? String(num) : num.toFixed(2);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
