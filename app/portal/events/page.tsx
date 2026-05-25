import Link from "next/link";
import { redirect } from "next/navigation";
import { Icons } from "../../components/icons";
import { createClient } from "../../../lib/supabase/server";
import { isStaff, type MemberLike } from "../../../lib/auth/permissions";

type ViewFilter = "upcoming" | "past" | "all";

const VIEW_TABS: { key: ViewFilter; label: string }[] = [
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
  { key: "all", label: "All" },
];

interface EventRow {
  id: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  location: string | null;
  area: { name: string } | null;
  category: { name: string; chip_class: string } | null;
}

export default async function PortalEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const params = await searchParams;
  const view: ViewFilter = isValidView(params.view) ? params.view : "upcoming";

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
  const staff = isStaff(me);

  const nowIso = new Date().toISOString();

  let query = supabase
    .from("events")
    .select(
      `id, title, description, start_at, end_at, location,
       area:areas(name),
       category:event_categories(name, chip_class)`
    )
    .is("deleted_at", null);

  if (view === "upcoming") {
    query = query.gte("start_at", nowIso).order("start_at", { ascending: true });
  } else if (view === "past") {
    query = query.lt("start_at", nowIso).order("start_at", { ascending: false });
  } else {
    query = query.order("start_at", { ascending: false });
  }

  const { data: rows } = await query;
  const events = (rows as unknown as EventRow[]) ?? [];

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
            Events
          </h2>
        </div>
        {staff && (
          <Link
            href="/portal/events/new"
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
            New event
          </Link>
        )}
      </div>

      <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
        {VIEW_TABS.map((t) => {
          const href = t.key === "upcoming" ? "/portal/events" : `/portal/events?view=${t.key}`;
          const active = view === t.key;
          return (
            <Link
              key={t.key}
              href={href}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                background: active ? "var(--gw-bg-elev)" : "transparent",
                border: "1px solid",
                borderColor: active ? "var(--gw-border)" : "transparent",
                fontSize: 13,
                fontWeight: 700,
                color: active ? "var(--gw-fg)" : "var(--gw-fg-muted)",
                textDecoration: "none",
              }}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      <div className="rsd-card" style={{ gap: 0, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--gw-border)" }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
            {events.length} {events.length === 1 ? "event" : "events"}
          </h3>
        </div>
        {events.length === 0 ? (
          <div style={{ padding: "48px 24px", textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--gw-fg)", marginBottom: 6 }}>
              {view === "upcoming"
                ? "No upcoming events"
                : view === "past"
                ? "No past events"
                : "No events yet"}
            </div>
            <div style={{ fontSize: 13, color: "var(--gw-fg-muted)" }}>
              {staff
                ? "Click + New event to add one."
                : "Check back later — staff add events here."}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {events.map((e, i) => (
              <EventRow
                key={e.id}
                event={e}
                staff={staff}
                border={i < events.length - 1}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function EventRow({
  event,
  staff,
  border,
}: {
  event: EventRow;
  staff: boolean;
  border: boolean;
}) {
  const chipClass = event.category?.chip_class ?? "rsd-chip-mute";
  const where = event.area?.name ?? event.location ?? null;

  return (
    <div
      style={{
        display: "flex",
        gap: 14,
        padding: "14px 18px",
        borderBottom: border ? "1px solid var(--gw-border)" : "none",
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <div
        className={`rsd-chip ${chipClass}`}
        style={{
          width: 56,
          flexShrink: 0,
          textAlign: "center",
          padding: "6px 0",
          borderRadius: 10,
          display: "block",
        }}
      >
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em" }}>
          {monthShort(event.start_at)}
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.1, marginTop: 2 }}>
          {dayNum(event.start_at)}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--gw-fg)" }}>{event.title}</span>
          {event.category && (
            <span className={`rsd-chip ${chipClass}`}>{event.category.name}</span>
          )}
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--gw-fg-muted)",
            fontWeight: 500,
            marginTop: 4,
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <span>{formatTimeRange(event.start_at, event.end_at)}</span>
          {where && (
            <>
              <span>·</span>
              <span>{where}</span>
            </>
          )}
        </div>
        {event.description && (
          <div
            style={{
              fontSize: 13,
              color: "var(--gw-fg)",
              fontWeight: 500,
              marginTop: 6,
              lineHeight: 1.5,
            }}
          >
            {event.description}
          </div>
        )}
      </div>
      {staff && (
        <Link
          href={`/portal/events/${event.id}/edit`}
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "var(--rsd-accent)",
            textDecoration: "none",
            padding: "6px 10px",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          Edit <Icons.ChevronRight width={12} height={12} />
        </Link>
      )}
    </div>
  );
}

function isValidView(s: string | undefined): s is ViewFilter {
  return s === "upcoming" || s === "past" || s === "all";
}

function monthShort(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short" });
}

function dayNum(iso: string): string {
  return String(new Date(iso).getDate());
}

function formatTimeRange(startIso: string, endIso: string | null): string {
  const start = new Date(startIso);
  const startStr = start.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  if (!endIso) return startStr;
  const end = new Date(endIso);
  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();
  const endStr = sameDay
    ? end.toLocaleString(undefined, { hour: "numeric", minute: "2-digit" })
    : end.toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
  return `${startStr} – ${endStr}`;
}
