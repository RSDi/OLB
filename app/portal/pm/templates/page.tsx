import Link from "next/link";
import { redirect } from "next/navigation";
import { Icons } from "../../../components/icons";
import { createClient } from "../../../../lib/supabase/server";
import { isStaff, type MemberLike } from "../../../../lib/auth/permissions";
import { describeSchedule, type ScheduleKind } from "../../../../lib/pm/schedule";
import { GenerateInstanceButton } from "./GenerateInstanceButton";

interface TemplateRow {
  id: string;
  title: string;
  description: string | null;
  schedule_kind: ScheduleKind;
  schedule_value: number;
  active: boolean;
  steps: { id: string; label: string }[];
  area: { name: string } | null;
  priority: { label: string; chip_class: string } | null;
}

export default async function PmTemplatesPage() {
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

  const { data: rows } = await supabase
    .from("pm_templates")
    .select(
      `id, title, description, schedule_kind, schedule_value, active, steps,
       area:areas(name),
       priority:priorities(label, chip_class)`
    )
    .is("deleted_at", null)
    .order("active", { ascending: false })
    .order("title", { ascending: true });
  const templates = (rows as unknown as TemplateRow[]) ?? [];

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
            PM Templates
          </h2>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link
            href="/portal/pm"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 20px",
              borderRadius: 100,
              background: "var(--gw-bg-elev)",
              border: "1px solid var(--gw-border)",
              color: "var(--gw-fg)",
              fontSize: 13,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            <Icons.ChevronLeft width={14} height={14} />
            Upcoming tasks
          </Link>
          <Link
            href="/portal/pm/templates/new"
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
            New template
          </Link>
        </div>
      </div>

      <div className="rsd-card" style={{ gap: 0, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--gw-border)" }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
            {templates.length} {templates.length === 1 ? "template" : "templates"}
          </h3>
        </div>
        {templates.length === 0 ? (
          <div style={{ padding: "48px 24px", textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--gw-fg)", marginBottom: 6 }}>
              No templates yet
            </div>
            <div style={{ fontSize: 13, color: "var(--gw-fg-muted)" }}>
              Create a template to define a recurring maintenance task with a checklist.
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {templates.map((t) => (
              <div
                key={t.id}
                style={{
                  display: "flex",
                  gap: 14,
                  padding: "14px 18px",
                  borderBottom: "1px solid var(--gw-border)",
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <Link
                  href={`/portal/pm/templates/${t.id}/edit`}
                  style={{
                    flex: 1,
                    minWidth: 240,
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "var(--gw-fg)" }}>
                      {t.title}
                    </span>
                    {!t.active && <span className="rsd-chip rsd-chip-mute">Inactive</span>}
                    {t.priority && (
                      <span className={`rsd-chip ${t.priority.chip_class}`}>{t.priority.label}</span>
                    )}
                    {t.area && (
                      <span style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 600 }}>
                        {t.area.name}
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--gw-fg-muted)",
                      fontWeight: 500,
                      marginTop: 4,
                    }}
                  >
                    {describeSchedule(t.schedule_kind, t.schedule_value)} · {t.steps.length}{" "}
                    {t.steps.length === 1 ? "step" : "steps"}
                  </div>
                </Link>
                {t.active && <GenerateInstanceButton templateId={t.id} />}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
