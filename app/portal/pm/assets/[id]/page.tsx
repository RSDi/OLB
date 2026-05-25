import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Icons } from "../../../../components/icons";
import { createClient } from "../../../../../lib/supabase/server";
import { isStaff, type MemberLike } from "../../../../../lib/auth/permissions";
import { AssetSuppliesPanel, type AssetSupplyLink } from "./SuppliesPanel";

interface Asset {
  id: string;
  name: string;
  type: string | null;
  notes: string | null;
  attributes: Record<string, unknown>;
  created_at: string;
  area: { name: string } | null;
}

interface HistoryRow {
  id: string;
  status: "pending" | "in_progress" | "done" | "skipped";
  completed_at: string | null;
  notes: string | null;
  created_at: string;
  instance: {
    id: string;
    title: string;
    scheduled_for: string;
  } | null;
}

export default async function AssetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: meRow } = await supabase
    .from("members")
    .select("role, status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!isStaff((meRow as MemberLike | null) ?? null)) redirect("/portal");

  const { data: assetRaw } = await supabase
    .from("assets")
    .select(
      `id, name, type, notes, attributes, created_at,
       area:areas(name)`
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!assetRaw) notFound();
  const asset = assetRaw as unknown as Asset;

  const { data: historyRaw } = await supabase
    .from("pm_instance_assets")
    .select(
      `id, status, completed_at, notes, created_at,
       instance:pm_instances(id, title, scheduled_for)`
    )
    .eq("asset_id", id)
    .order("created_at", { ascending: false })
    .limit(50);
  const history = (historyRaw as unknown as HistoryRow[]) ?? [];

  const { data: linksRaw } = await supabase
    .from("asset_supplies")
    .select(
      `id, supply_id, qty_per_use,
       supply:supplies(id, name, unit, on_hand)`
    )
    .eq("asset_id", id);
  const supplyLinks = ((linksRaw as unknown as AssetSupplyLink[]) ?? []).map((l) => ({
    ...l,
    qty_per_use: Number(l.qty_per_use),
    supply: l.supply
      ? { ...l.supply, on_hand: Number(l.supply.on_hand) }
      : null,
  }));

  const { data: allSuppliesRaw } = await supabase
    .from("supplies")
    .select("id, name, unit, on_hand")
    .is("deleted_at", null)
    .order("name", { ascending: true });
  const allSupplies = ((allSuppliesRaw as { id: string; name: string; unit: string; on_hand: number }[]) ?? []).map(
    (s) => ({ ...s, on_hand: Number(s.on_hand) })
  );

  const attributeEntries = Object.entries(asset.attributes ?? {});

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <div className="rsd-eyebrow" style={{ marginBottom: 6 }}>
            Facilities · Asset
          </div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-.02em" }}>
            {asset.name}
          </h2>
        </div>
        <Link
          href="/portal/settings"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 16px",
            borderRadius: 100,
            background: "var(--gw-bg-elev)",
            color: "var(--gw-fg)",
            border: "1px solid var(--gw-border)",
            fontSize: 13,
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          <Icons.ChevronLeft width={14} height={14} />
          Back to settings
        </Link>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 280px",
          gap: 20,
          alignItems: "flex-start",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="rsd-card" style={{ gap: 14 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Maintenance history</h3>
            {history.length === 0 ? (
              <div
                style={{
                  padding: "24px 0",
                  textAlign: "center",
                  fontSize: 13,
                  color: "var(--gw-fg-muted)",
                  fontWeight: 500,
                }}
              >
                No PM tasks have touched this asset yet.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {history.map((h, i) => (
                  <Link
                    key={h.id}
                    href={h.instance ? `/portal/pm/${h.instance.id}` : "#"}
                    style={{
                      display: "flex",
                      gap: 12,
                      padding: "12px 0",
                      borderBottom: i < history.length - 1 ? "1px solid var(--gw-border)" : "none",
                      textDecoration: "none",
                      color: "inherit",
                      alignItems: "flex-start",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          alignItems: "center",
                          flexWrap: "wrap",
                        }}
                      >
                        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--gw-fg)" }}>
                          {h.instance?.title ?? "(deleted instance)"}
                        </span>
                        {statusChip(h.status)}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--gw-fg-muted)",
                          fontWeight: 500,
                          marginTop: 3,
                        }}
                      >
                        Scheduled {h.instance ? formatDate(h.instance.scheduled_for) : "—"}
                        {h.completed_at ? ` · ${h.status === "skipped" ? "Skipped" : "Completed"} ${formatDate(h.completed_at)}` : ""}
                      </div>
                      {h.notes && (
                        <div
                          style={{
                            fontSize: 13,
                            color: "var(--gw-fg)",
                            marginTop: 6,
                            padding: "8px 10px",
                            background: "var(--gw-bg)",
                            border: "1px solid var(--gw-border)",
                            borderRadius: 6,
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {h.notes}
                        </div>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="rsd-card" style={{ gap: 14 }}>
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
              Details
            </h3>
            <Field label="Area" value={asset.area?.name ?? "—"} />
            <Field
              label="Type"
              value={
                asset.type ? (
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: 100,
                      background: "var(--gw-bg)",
                      border: "1px solid var(--gw-border)",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--gw-fg)",
                    }}
                  >
                    {asset.type}
                  </span>
                ) : (
                  "—"
                )
              }
            />
            <Field label="Added" value={formatDate(asset.created_at)} />
          </div>

          {asset.notes && (
            <div className="rsd-card" style={{ gap: 8 }}>
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
                Notes
              </h3>
              <div style={{ fontSize: 13, color: "var(--gw-fg)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                {asset.notes}
              </div>
            </div>
          )}

          {attributeEntries.length > 0 && (
            <div className="rsd-card" style={{ gap: 8 }}>
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
                Attributes
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {attributeEntries.map(([k, v]) => (
                  <div
                    key={k}
                    style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}
                  >
                    <span style={{ color: "var(--gw-fg-muted)", fontWeight: 600 }}>{k}</span>
                    <span style={{ color: "var(--gw-fg)", fontWeight: 600 }}>{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <AssetSuppliesPanel
            assetId={asset.id}
            links={supplyLinks}
            allSupplies={allSupplies}
          />
        </div>
      </div>
    </>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "var(--gw-fg-muted)",
          textTransform: "uppercase",
          letterSpacing: ".04em",
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--gw-fg)" }}>{value}</span>
    </div>
  );
}

function statusChip(s: HistoryRow["status"]) {
  if (s === "pending") return <span className="rsd-chip rsd-chip-warn">Pending</span>;
  if (s === "in_progress") return <span className="rsd-chip rsd-chip-accent">In Progress</span>;
  if (s === "skipped") return <span className="rsd-chip rsd-chip-mute">Skipped</span>;
  return <span className="rsd-chip rsd-chip-success">Done</span>;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
