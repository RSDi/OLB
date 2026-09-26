import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Icons } from "../../../../../components/icons";
import { createClient } from "../../../../../../lib/supabase/server";
import { getAuthUser } from "../../../../../../lib/auth/viewer";
import { isStaff, isSuperAdmin, type MemberLike } from "../../../../../../lib/auth/permissions";
import { TemplateForm, type TemplateInitialValues } from "../../TemplateForm";
import type { ScheduleKind } from "../../../../../../lib/pm/schedule";

interface TemplateRow {
  id: string;
  title: string;
  description: string | null;
  area_id: string | null;
  priority_id: string | null;
  schedule_kind: ScheduleKind;
  schedule_value: number;
  steps: { id: string; label: string }[];
  active: boolean;
  per_asset: boolean;
  asset_type: string | null;
}

export default async function EditTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const user = await getAuthUser();
  if (!user) redirect("/login");

  const { data: meRow } = await supabase
    .from("members")
    .select("role, status")
    .eq("user_id", user.id)
    .maybeSingle();
  const me = (meRow as MemberLike | null) ?? null;
  if (!isStaff(me)) redirect("/portal");

  const { data: template } = await supabase
    .from("pm_templates")
    .select("id, title, description, area_id, priority_id, schedule_kind, schedule_value, steps, active, per_asset, asset_type")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!template) notFound();
  const t = template as TemplateRow;

  const [{ data: areas }, { data: priorities }, { data: assetTypeRows }] = await Promise.all([
    supabase
      .from("areas")
      .select("id, name")
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("priorities")
      .select("id, label")
      .is("deleted_at", null)
      .order("severity", { ascending: true }),
    supabase.from("assets").select("area_id, type").is("deleted_at", null),
  ]);
  const assetTypeRefs =
    (assetTypeRows as { area_id: string | null; type: string | null }[]) ?? [];

  const initial: TemplateInitialValues = {
    id: t.id,
    title: t.title,
    description: t.description ?? "",
    areaId: t.area_id ?? "",
    priorityId: t.priority_id ?? "",
    scheduleKind: t.schedule_kind,
    scheduleValue: t.schedule_value,
    steps: t.steps.map((s) => s.label),
    active: t.active,
    perAsset: t.per_asset,
    assetType: t.asset_type ?? "",
  };

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
          {t.title}
        </h2>
        <Link
          href="/portal/pm/templates"
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
          Back to templates
        </Link>
      </div>

      <TemplateForm
        initial={initial}
        areas={areas ?? []}
        priorities={priorities ?? []}
        assetTypeRefs={assetTypeRefs}
        canDelete={isSuperAdmin(me)}
      />
    </>
  );
}
