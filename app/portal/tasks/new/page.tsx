import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../../../lib/supabase/server";
import { Icons } from "../../../components/icons";
import { MaintenanceRequestForm } from "./Form";

export default async function NewMaintenanceRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ description?: string; priority?: string; project?: string; category?: string }>;
}) {
  const { description, priority, project, category } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: areas }, { data: priorities }, { data: categories }] = await Promise.all([
    supabase
      .from("areas")
      .select("id, name")
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("priorities")
      .select("id, key, label, chip_class")
      .is("deleted_at", null)
      .order("severity", { ascending: true }),
    supabase
      .from("task_categories")
      .select("id, name")
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
  ]);

  const { data: projectRow } = project
    ? await supabase.from("projects").select("id, title").eq("id", project).is("deleted_at", null).maybeSingle()
    : { data: null as { id: string; title: string } | null };

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <Link
          href="/portal/tasks"
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
          Back to queue
        </Link>
      </div>

      <div style={{ maxWidth: 680 }}>
        <div className="rsd-card">
          <MaintenanceRequestForm
            areas={areas ?? []}
            priorities={priorities ?? []}
            categories={categories ?? []}
            initialDescription={description ?? ""}
            initialPriorityKey={priority ?? ""}
            project={projectRow ?? null}
            initialCategoryName={category ?? ""}
          />
        </div>
      </div>
    </>
  );
}
