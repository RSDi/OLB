import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Icons } from "../../../components/icons";
import { createClient } from "../../../../lib/supabase/server";
import { isStaff, type MemberLike } from "../../../../lib/auth/permissions";
import { ChecklistAndActions } from "./Actions";
import { AssetScopedActions, type AssetRow } from "./AssetScopedActions";
import type { InstanceStatus, InstanceStepCheck } from "../../../../lib/pm/actions";

interface Instance {
  id: string;
  template_id: string;
  title: string;
  description: string | null;
  scheduled_for: string;
  status: InstanceStatus;
  step_checks: InstanceStepCheck[];
  notes: string | null;
  completed_at: string | null;
  area: { name: string } | null;
  priority: { label: string; chip_class: string } | null;
  completed_by_member: { full_name: string | null; email: string } | null;
}

interface TemplateSteps {
  steps: { id: string; label: string }[];
}

export default async function PmInstanceDetailPage({
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

  const { data: instanceRaw } = await supabase
    .from("pm_instances")
    .select(
      `id, template_id, title, description, scheduled_for, status, step_checks, notes, completed_at,
       area:areas(name),
       priority:priorities(label, chip_class),
       completed_by_member:members!completed_by(full_name, email)`
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!instanceRaw) notFound();
  const inst = instanceRaw as unknown as Instance;

  const { data: templateRaw } = await supabase
    .from("pm_templates")
    .select("steps, asset_type")
    .eq("id", inst.template_id)
    .maybeSingle();
  const templateSteps = ((templateRaw as TemplateSteps | null)?.steps ?? []) as {
    id: string;
    label: string;
  }[];

  // Try to fetch per-asset sub-records. Their presence signals an
  // asset-scoped instance regardless of what the template currently says.
  const { data: subRecordsRaw } = await supabase
    .from("pm_instance_assets")
    .select(
      `id, asset_id, status, step_checks, notes, completed_at,
       asset:assets(name, type)`
    )
    .eq("instance_id", inst.id)
    .order("created_at", { ascending: true });

  interface SubRowJoined {
    id: string;
    asset_id: string;
    status: InstanceStatus;
    step_checks: InstanceStepCheck[];
    notes: string | null;
    completed_at: string | null;
    asset: { name: string; type: string | null } | null;
  }
  const subRecords = (subRecordsRaw as unknown as SubRowJoined[]) ?? [];
  const assetScoped = subRecords.length > 0;

  // Non-asset-scoped: derive checklist from template + instance step_checks.
  const stepIdsInChecks = new Set(inst.step_checks.map((c) => c.step_id));
  const orderedSteps = templateSteps.filter((s) => stepIdsInChecks.has(s.id));
  for (const c of inst.step_checks) {
    if (!orderedSteps.find((s) => s.id === c.step_id)) {
      orderedSteps.push({ id: c.step_id, label: "(removed step)" });
    }
  }

  // Fetch supplies linked to any of the assets on this instance so each card
  // can offer per-asset usage inputs at completion time.
  const assetIds = subRecords.map((r) => r.asset_id);
  interface AssetSupplyJoined {
    asset_id: string;
    supply_id: string;
    qty_per_use: number;
    supply: { id: string; name: string; unit: string; on_hand: number } | null;
  }
  let suppliesByAsset = new Map<string, AssetSupplyJoined[]>();
  if (assetScoped && assetIds.length > 0) {
    const { data: linksRaw } = await supabase
      .from("asset_supplies")
      .select(
        `asset_id, supply_id, qty_per_use,
         supply:supplies(id, name, unit, on_hand)`
      )
      .in("asset_id", assetIds);
    const links = (linksRaw as unknown as AssetSupplyJoined[]) ?? [];
    for (const l of links) {
      // Skip if the supply has been soft-deleted (join returns null).
      if (!l.supply) continue;
      const list = suppliesByAsset.get(l.asset_id) ?? [];
      list.push(l);
      suppliesByAsset.set(l.asset_id, list);
    }
  }

  // Asset-scoped: sort assets alphabetically by name and map to UI shape.
  const assetRows: AssetRow[] = subRecords
    .map((r) => {
      const links = suppliesByAsset.get(r.asset_id) ?? [];
      return {
        id: r.id,
        asset_id: r.asset_id,
        asset_name: r.asset?.name ?? "(deleted asset)",
        asset_type: r.asset?.type ?? null,
        status: r.status,
        step_checks: r.step_checks ?? [],
        notes: r.notes,
        completed_at: r.completed_at,
        supplies: links
          .filter((l) => l.supply)
          .map((l) => ({
            supply_id: l.supply_id,
            qty_per_use: Number(l.qty_per_use),
            name: l.supply!.name,
            unit: l.supply!.unit,
            on_hand: Number(l.supply!.on_hand),
          })),
      };
    })
    .sort((a, b) => a.asset_name.localeCompare(b.asset_name));

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
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-.02em" }}>
          {inst.title}
        </h2>
        <Link
          href="/portal/pm"
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
          Back to tasks
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
          {inst.description && (
            <div className="rsd-card" style={{ gap: 10 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {inst.priority && (
                  <span className={`rsd-chip ${inst.priority.chip_class}`}>{inst.priority.label}</span>
                )}
                {statusChip(inst.status)}
                {inst.area && (
                  <span style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 600 }}>
                    {inst.area.name}
                  </span>
                )}
              </div>
              <div
                style={{
                  fontSize: 14,
                  color: "var(--gw-fg)",
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                }}
              >
                {inst.description}
              </div>
            </div>
          )}

          {assetScoped ? (
            <AssetScopedActions steps={templateSteps} assets={assetRows} />
          ) : (
            <ChecklistAndActions
              instanceId={inst.id}
              status={inst.status}
              steps={orderedSteps}
              checks={inst.step_checks}
              initialNotes={inst.notes ?? ""}
            />
          )}
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
            <Field label="Area" value={inst.area?.name ?? "—"} />
            <Field
              label="Priority"
              value={
                inst.priority ? (
                  <span className={`rsd-chip ${inst.priority.chip_class}`}>{inst.priority.label}</span>
                ) : (
                  "—"
                )
              }
            />
            <Field label="Status" value={statusChip(inst.status)} />
            <Field label="Scheduled" value={formatDate(inst.scheduled_for)} />
            {inst.completed_at && (
              <>
                <Field label={inst.status === "skipped" ? "Skipped" : "Completed"} value={formatDateTime(inst.completed_at)} />
                {inst.completed_by_member && (
                  <Field
                    label="By"
                    value={inst.completed_by_member.full_name ?? inst.completed_by_member.email}
                  />
                )}
              </>
            )}
            <Field
              label="From template"
              value={
                <Link
                  href={`/portal/pm/templates/${inst.template_id}/edit`}
                  style={{ color: "var(--rsd-accent)", fontWeight: 700, textDecoration: "none" }}
                >
                  View →
                </Link>
              }
            />
          </div>
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

function statusChip(s: InstanceStatus) {
  if (s === "pending") return <span className="rsd-chip rsd-chip-warn">Pending</span>;
  if (s === "in_progress") return <span className="rsd-chip rsd-chip-accent">In Progress</span>;
  if (s === "skipped") return <span className="rsd-chip rsd-chip-mute">Skipped</span>;
  return <span className="rsd-chip rsd-chip-success">Done</span>;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
