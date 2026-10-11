"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pill } from "../../../components/ui";
import { ErrorNote, capStyle } from "../../payments/parts";
import { markUniformsOrdered, setUniformSize } from "../../../../lib/onboarding/uniform-actions";
import { countSizes, orderCsv } from "../../../../lib/onboarding/uniforms";
import type { UniformPage } from "../../../../lib/onboarding/uniform-data";

const muted: React.CSSProperties = { fontSize: 12.5, color: "var(--gw-fg-muted)", fontWeight: 500 };

// Sarah's page: how many of each size to order, who's still missing a size,
// every player's sizes to change at try-on, the order sheet, and the
// charges when the order goes in.
export function UniformsView({ data }: { data: UniformPage }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "missing">("all");

  const table = useMemo(() => countSizes(data.items, data.rows), [data]);
  const missing = data.players.filter((p) => (p.needs ?? []).some((id) => !p.sizes[id]));
  const confirmed = data.rows.filter((r) => r.confirmed).length;
  const shown = filter === "missing" ? missing : data.players;

  async function act(key: string, fn: () => Promise<{ error?: string; notice?: string }>) {
    setBusy(key);
    setError(null);
    setNotice(null);
    const res = await fn();
    setBusy(null);
    if (res.error) return setError(res.error);
    if (res.notice) setNotice(res.notice);
    router.refresh();
  }

  function download() {
    const blob = new Blob([orderCsv(data.items, data.rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `uniform-order-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (data.items.length === 0) {
    return (
      <div className="rsd-card" style={{ padding: "32px 24px", textAlign: "center", gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>No uniform items yet</div>
        <div style={muted}>
          Add the jersey, shorts and anything else in <Link href="/portal/settings?tab=uniforms">Settings → Uniforms</Link>.
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Uniforms</h1>
        <span style={muted}>
          {[
            data.settings.order_deadline && `Order by ${new Date(`${data.settings.order_deadline}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
            data.settings.try_on && `Try-on: ${data.settings.try_on}`,
            data.settings.ordered_at && `Ordered ${new Date(data.settings.ordered_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
        <span style={{ flex: 1 }} />
        <Link href="/portal/settings?tab=uniforms" style={{ fontSize: 12, fontWeight: 700, color: "var(--gw-fg-muted)" }}>
          Items, prices and sizes
        </Link>
      </div>

      <div className="rsd-card" data-tour="uniforms-counts" style={{ padding: 0, gap: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
            <thead>
              <tr>
                <th style={{ ...capStyle, fontSize: 10.5, textAlign: "left", padding: "10px 14px" }}>Item</th>
                {table.sizes.map((s) => (
                  <th key={s} style={{ ...capStyle, fontSize: 10.5, textAlign: "right", padding: "10px 10px" }}>
                    {s}
                  </th>
                ))}
                <th style={{ ...capStyle, fontSize: 10.5, textAlign: "right", padding: "10px 14px" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r) => (
                <tr key={r.item.id} style={{ borderTop: "1px solid var(--gw-border)" }}>
                  <td style={{ padding: "9px 14px", fontWeight: 700 }}>{r.item.name}</td>
                  {table.sizes.map((s) => (
                    <td key={s} style={{ padding: "9px 10px", textAlign: "right", color: r.item.sizes.includes(s) ? "var(--gw-fg)" : "var(--gw-fg-faint)" }}>
                      {r.item.sizes.includes(s) ? r.counts[s] ?? 0 : "–"}
                    </td>
                  ))}
                  <td style={{ padding: "9px 14px", textAlign: "right", fontWeight: 800 }}>{r.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ borderTop: "1px solid var(--gw-border)", padding: "12px 14px", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <span style={muted}>
            {missing.length > 0 ? <strong style={{ color: "var(--gw-error)" }}>{missing.length} players missing a size</strong> : "Every size is in"} · {confirmed} confirmed at try-on
            {data.pending > 0 && ` · ${data.pending} more on registrations not approved yet`}
          </span>
          <span style={{ flex: 1 }} />
          <Pill size="sm" variant="light" onClick={download}>
            Download order sheet
          </Pill>
          <span data-tour="uniforms-order" style={{ display: "inline-flex" }}>
            <Pill
              size="sm"
              variant="accent"
              disabled={busy !== null}
              onClick={() =>
                confirm("Add each sized item's price to the family's Payments account? Items already charged aren't charged again.") &&
                act("order", markUniformsOrdered)
              }
            >
              {busy === "order" ? "Adding charges…" : "Mark ordered and add charges"}
            </Pill>
          </span>
        </div>
      </div>
      {error && <ErrorNote text={error} />}
      {notice && (
        <div role="status" style={{ padding: "10px 14px", borderRadius: 10, background: "var(--rsd-accent-bg)", fontSize: 13, fontWeight: 600 }}>
          {notice}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Players</h2>
        <div role="tablist" aria-label="Show" style={{ display: "inline-flex", gap: 2, padding: 3, borderRadius: 10, background: "var(--gw-border)" }}>
          {(
            [
              ["all", `Everyone · ${data.players.length}`],
              ["missing", `Missing a size · ${missing.length}`],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={filter === k}
              onClick={() => setFilter(k)}
              style={{
                height: 30,
                padding: "0 12px",
                borderRadius: 8,
                border: "none",
                background: filter === k ? "var(--gw-bg-elev)" : "transparent",
                color: filter === k ? "var(--gw-fg)" : "var(--gw-fg-muted)",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <span style={muted}>Change a size at try-on and it&apos;s marked confirmed ✓.</span>
      </div>

      <div className="rsd-card" data-tour="uniforms-players" style={{ padding: 0, gap: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ ...capStyle, fontSize: 10.5, textAlign: "left", padding: "10px 14px" }}>Player</th>
                {data.items.map((i) => (
                  <th key={i.id} style={{ ...capStyle, fontSize: 10.5, textAlign: "left", padding: "10px 10px" }}>
                    {i.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.id} style={{ borderTop: "1px solid var(--gw-border)" }}>
                  <td style={{ padding: "8px 14px", minWidth: 160 }}>
                    <div style={{ fontWeight: 700 }}>{p.name}</div>
                    <div style={{ ...muted, fontSize: 11.5 }}>{p.team ?? "No team yet"}</div>
                  </td>
                  {data.items.map((i) => {
                    const cur = p.sizes[i.id];
                    const needed = p.needs?.includes(i.id) ?? false;
                    return (
                      <td key={i.id} style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                        <select
                          aria-label={`${p.name}'s ${i.name} size`}
                          value={cur?.size ?? ""}
                          disabled={busy !== null || cur?.charged}
                          onChange={(e) => act(`${p.id}-${i.id}`, () => setUniformSize({ playerId: p.id, itemId: i.id, size: e.target.value, confirm: true }))}
                          style={{
                            height: 32,
                            borderRadius: 8,
                            border: `1px solid ${needed && !cur ? "var(--gw-error)" : "var(--gw-border)"}`,
                            background: "var(--gw-bg)",
                            color: "var(--gw-fg)",
                            padding: "0 8px",
                            fontSize: 13,
                          }}
                        >
                          <option value="">{needed ? "Needs a size" : "—"}</option>
                          {i.sizes.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                        {cur?.confirmed && <span title="Confirmed at try-on" style={{ marginLeft: 6, color: "var(--gw-success)", fontWeight: 800 }}>✓</span>}
                        {cur?.charged && <span title="On the family's Payments account" style={{ marginLeft: 6, ...muted, fontSize: 11 }}>charged</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {shown.length === 0 && <div style={{ padding: "20px 14px", ...muted }}>Nobody here.</div>}
      </div>
    </div>
  );
}
