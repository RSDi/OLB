import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "../../../../../lib/supabase/server";
import { Icons } from "../../../../components/icons";

interface ProjectTask {
  id: string;
  description: string;
  status: string;
  category: { name: string; chip_class: string } | null;
  priority: { label: string; chip_class: string } | null;
}
interface Project {
  id: string;
  title: string;
  description: string | null;
  status: string;
  category: { name: string; chip_class: string } | null;
}

function statusChip(s: string) {
  const map: Record<string, string> = {
    open: "rsd-chip-warn",
    in_progress: "rsd-chip-accent",
    done: "rsd-chip-success",
    cancelled: "rsd-chip-mute",
  };
  const label = s === "in_progress" ? "In Progress" : s.charAt(0).toUpperCase() + s.slice(1);
  return <span className={`rsd-chip ${map[s] ?? "rsd-chip-mute"}`}>{label}</span>;
}

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: projectRaw } = await supabase
    .from("projects")
    .select("id, title, description, status, category:task_categories(name, chip_class)")
    .is("deleted_at", null)
    .eq("id", id)
    .maybeSingle();
  if (!projectRaw) notFound();
  const project = projectRaw as unknown as Project;

  const { data: tasksRaw } = await supabase
    .from("maintenance_requests")
    .select(
      "id, description, status, category:task_categories(name, chip_class), priority:priorities(label, chip_class)"
    )
    .eq("project_id", id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  const tasks = (tasksRaw as unknown as ProjectTask[]) ?? [];

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <Link
          href="/portal/tasks/projects"
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
          All projects
        </Link>
        <Link
          href={`/portal/tasks/new?project=${project.id}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 20px",
            borderRadius: 100,
            background: "var(--rsd-accent)",
            color: "var(--rsd-accent-on)",
            fontSize: 13,
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          <Icons.Plus width={14} height={14} />
          Add task
        </Link>
      </div>

      <div className="rsd-card" style={{ gap: 12 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {project.category && (
            <span className={`rsd-chip ${project.category.chip_class}`}>{project.category.name}</span>
          )}
          {project.status !== "active" && (
            <span className="rsd-chip rsd-chip-mute">{project.status}</span>
          )}
        </div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "var(--gw-fg)", lineHeight: 1.25 }}>
          {project.title}
        </h1>
        {project.description && (
          <p style={{ margin: 0, fontSize: 14, color: "var(--gw-fg)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
            {project.description}
          </p>
        )}
      </div>

      <div className="rsd-card" style={{ gap: 0, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--gw-border)" }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
            {tasks.length} {tasks.length === 1 ? "task" : "tasks"}
          </h3>
        </div>
        {tasks.length === 0 ? (
          <div style={{ padding: "40px 24px", textAlign: "center", fontSize: 13, color: "var(--gw-fg-muted)" }}>
            No tasks in this project yet — add one above.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {tasks.map((t) => (
              <Link
                key={t.id}
                href={`/portal/tasks/${t.id}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 20px",
                  borderBottom: "1px solid var(--gw-border)",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: "var(--gw-fg)" }}>
                  {t.description}
                </div>
                {t.category && (
                  <span className={`rsd-chip ${t.category.chip_class}`} style={{ fontSize: 11 }}>
                    {t.category.name}
                  </span>
                )}
                {t.priority && (
                  <span className={`rsd-chip ${t.priority.chip_class}`} style={{ fontSize: 11 }}>
                    {t.priority.label}
                  </span>
                )}
                {statusChip(t.status)}
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
