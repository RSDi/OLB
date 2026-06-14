import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Icons } from "../../../../components/icons";
import { createClient } from "../../../../../lib/supabase/server";
import { isStaff, isSuperAdmin, type MemberLike } from "../../../../../lib/auth/permissions";
import { EventForm, type EventInitialValues } from "../../EventForm";
import { ProcedureRunner } from "../../../../components/ProcedureRunner";

interface EventRow {
  id: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  location: string | null;
  area_id: string | null;
  category_id: string | null;
  shutdown_playbook_id: string | null;
}

export default async function EditEventPage({
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
  const me = (meRow as MemberLike | null) ?? null;
  if (!isStaff(me)) redirect("/portal/events");

  const { data: eventRaw } = await supabase
    .from("events")
    .select("id, title, description, start_at, end_at, location, area_id, category_id, shutdown_playbook_id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!eventRaw) notFound();
  const ev = eventRaw as EventRow;

  const [{ data: areas }, { data: categories }, { data: shutdownPlaybooks }] = await Promise.all([
    supabase
      .from("areas")
      .select("id, name")
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("event_categories")
      .select("id, name, chip_class")
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    // Runnable procedures (0060), for the shutdown-link picker.
    supabase
      .from("playbooks")
      .select("id, title")
      .not("steps", "is", null)
      .is("deleted_at", null)
      .order("title", { ascending: true }),
  ]);

  // If a shutdown procedure is linked, load it so we can render the run-wizard
  // (Start shutdown) right on this event's page.
  let shutdownProc:
    | { id: string; title: string; steps: string[]; hasSlackChannel: boolean }
    | null = null;
  if (ev.shutdown_playbook_id) {
    const { data: pb } = await supabase
      .from("playbooks")
      .select("id, title, steps, wizard_slack_channel")
      .eq("id", ev.shutdown_playbook_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (pb) {
      const p = pb as {
        id: string;
        title: string;
        steps: { label: string }[] | null;
        wizard_slack_channel: string | null;
      };
      const steps = (p.steps ?? []).map((s) => s.label).filter(Boolean);
      if (steps.length > 0) {
        shutdownProc = {
          id: p.id,
          title: p.title,
          steps,
          hasSlackChannel: !!p.wizard_slack_channel,
        };
      }
    }
  }

  const initial: EventInitialValues = {
    id: ev.id,
    title: ev.title,
    description: ev.description ?? "",
    startAt: toDatetimeLocal(ev.start_at),
    endAt: ev.end_at ? toDatetimeLocal(ev.end_at) : "",
    location: ev.location ?? "",
    areaId: ev.area_id ?? "",
    categoryId: ev.category_id ?? "",
    shutdownPlaybookId: ev.shutdown_playbook_id ?? "",
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
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-.02em", flex: 1, minWidth: 0 }}>
          {ev.title}
        </h2>
        <Link
          href="/portal/events"
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
          Back to events
        </Link>
      </div>

      {shutdownProc && (
        <div style={{ marginTop: 16 }}>
          <ProcedureRunner
            playbookId={shutdownProc.id}
            title={shutdownProc.title}
            steps={shutdownProc.steps}
            hasSlackChannel={shutdownProc.hasSlackChannel}
            eventId={ev.id}
            startLabel="Start shutdown"
          />
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <EventForm
          initial={initial}
          areas={areas ?? []}
          categories={categories ?? []}
          shutdownPlaybooks={shutdownPlaybooks ?? []}
          canDelete={isSuperAdmin(me)}
        />
      </div>
    </>
  );
}

// Format an ISO timestamp into the local-time string that
// <input type="datetime-local"> expects ("YYYY-MM-DDTHH:mm").
function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
