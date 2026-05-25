import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Icons } from "../../../../components/icons";
import { createClient } from "../../../../../lib/supabase/server";
import { isStaff, isSuperAdmin, type MemberLike } from "../../../../../lib/auth/permissions";
import { EventForm, type EventInitialValues } from "../../EventForm";

interface EventRow {
  id: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  location: string | null;
  area_id: string | null;
  category_id: string | null;
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
    .select("id, title, description, start_at, end_at, location, area_id, category_id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!eventRaw) notFound();
  const ev = eventRaw as EventRow;

  const [{ data: areas }, { data: categories }] = await Promise.all([
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
  ]);

  const initial: EventInitialValues = {
    id: ev.id,
    title: ev.title,
    description: ev.description ?? "",
    startAt: toDatetimeLocal(ev.start_at),
    endAt: ev.end_at ? toDatetimeLocal(ev.end_at) : "",
    location: ev.location ?? "",
    areaId: ev.area_id ?? "",
    categoryId: ev.category_id ?? "",
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
        <div>
          <div className="rsd-eyebrow" style={{ marginBottom: 6 }}>
            Calendar
          </div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-.02em" }}>
            {ev.title}
          </h2>
        </div>
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

      <EventForm
        initial={initial}
        areas={areas ?? []}
        categories={categories ?? []}
        canDelete={isSuperAdmin(me)}
      />
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
