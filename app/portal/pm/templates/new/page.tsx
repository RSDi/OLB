import Link from "next/link";
import { redirect } from "next/navigation";
import { Icons } from "../../../../components/icons";
import { createClient } from "../../../../../lib/supabase/server";
import { isStaff, type MemberLike } from "../../../../../lib/auth/permissions";
import { TemplateForm } from "../TemplateForm";

export default async function NewTemplatePage() {
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
            Facilities · Preventative
          </div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-.02em" }}>
            New PM Template
          </h2>
        </div>
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
        areas={areas ?? []}
        priorities={priorities ?? []}
        assetTypeRefs={assetTypeRefs}
      />
    </>
  );
}
