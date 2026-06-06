import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../../../lib/supabase/server";
import { Icons } from "../../../components/icons";
import { NewProjectForm } from "./NewProjectForm";

interface ProjectRow {
  id: string;
  title: string;
  description: string | null;
  status: string;
  created_at: string;
  category: { name: string; chip_class: string } | null;
}

export default async function ProjectsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: projectsRaw }, { data: categoriesRaw }] = await Promise.all([
    supabase
      .from("projects")
      .select("id, title, description, status, created_at, category:task_categories(name, chip_class)")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("task_categories")
      .select("id, name")
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
  ]);
  const projects = (projectsRaw as unknown as ProjectRow[]) ?? [];
  const categories = (categoriesRaw as { id: string; name: string }[]) ?? [];

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
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
          Back to tasks
        </Link>
      </div>

      <NewProjectForm categories={categories} />

      <div className="rsd-card" style={{ gap: 0, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--gw-border)" }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
            {projects.length} {projects.length === 1 ? "project" : "projects"}
          </h3>
        </div>
        {projects.length === 0 ? (
          <div style={{ padding: "48px 24px", textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--gw-fg)", marginBottom: 6 }}>
              No projects yet
            </div>
            <div style={{ fontSize: 13, color: "var(--gw-fg-muted)" }}>
              Create one above to group related tasks.
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {projects.map((p) => (
              <Link
                key={p.id}
                href={`/portal/tasks/projects/${p.id}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "14px 20px",
                  borderBottom: "1px solid var(--gw-border)",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "var(--gw-fg)" }}>{p.title}</div>
                  {p.description && (
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--gw-fg-muted)",
                        marginTop: 2,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {p.description}
                    </div>
                  )}
                </div>
                {p.category && (
                  <span className={`rsd-chip ${p.category.chip_class}`} style={{ fontSize: 11 }}>
                    {p.category.name}
                  </span>
                )}
                {p.status !== "active" && (
                  <span className="rsd-chip rsd-chip-mute" style={{ fontSize: 11 }}>
                    {p.status}
                  </span>
                )}
                <Icons.ChevronRight width={16} height={16} />
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
