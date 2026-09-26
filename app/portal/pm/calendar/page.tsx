import Link from "next/link";
import { redirect } from "next/navigation";
import { Icons } from "../../../components/icons";
import { createClient } from "../../../../lib/supabase/server";
import { getAuthUser } from "../../../../lib/auth/viewer";
import { isStaff, type MemberLike } from "../../../../lib/auth/permissions";

interface InstanceRow {
  id: string;
  title: string;
  scheduled_for: string;
  status: "pending" | "in_progress" | "done" | "skipped";
  area_id: string | null;
  area: { name: string } | null;
  priority: { label: string; chip_class: string } | null;
}

interface Area {
  id: string;
  name: string;
}

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function PmCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; area?: string }>;
}) {
  const params = await searchParams;

  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const { data: meRow } = await supabase
    .from("members")
    .select("role, status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!isStaff((meRow as MemberLike | null) ?? null)) redirect("/portal");

  const month = parseMonth(params.month);
  const areaFilter = params.area || null;

  const monthStart = new Date(month.year, month.zeroIdx, 1);
  const monthEnd = new Date(month.year, month.zeroIdx + 1, 0);
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - monthStart.getDay());
  const gridEnd = new Date(monthEnd);
  gridEnd.setDate(monthEnd.getDate() + (6 - monthEnd.getDay()));

  let query = supabase
    .from("pm_instances")
    .select(
      `id, title, scheduled_for, status, area_id,
       area:areas(name),
       priority:priorities(label, chip_class)`
    )
    .is("deleted_at", null)
    .gte("scheduled_for", isoDate(gridStart))
    .lte("scheduled_for", isoDate(gridEnd))
    .order("scheduled_for", { ascending: true });
  if (areaFilter) query = query.eq("area_id", areaFilter);

  const { data: instancesRaw } = await query;
  const instances = (instancesRaw as unknown as InstanceRow[]) ?? [];

  const { data: areasRaw } = await supabase
    .from("areas")
    .select("id, name")
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  const areas = (areasRaw as Area[]) ?? [];

  const byDate = new Map<string, InstanceRow[]>();
  for (const inst of instances) {
    const list = byDate.get(inst.scheduled_for) ?? [];
    list.push(inst);
    byDate.set(inst.scheduled_for, list);
  }

  const days: Date[] = [];
  for (
    let d = new Date(gridStart);
    d <= gridEnd;
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
  ) {
    days.push(new Date(d));
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const prevMonth = month.zeroIdx === 0
    ? { year: month.year - 1, zeroIdx: 11 }
    : { year: month.year, zeroIdx: month.zeroIdx - 1 };
  const nextMonth = month.zeroIdx === 11
    ? { year: month.year + 1, zeroIdx: 0 }
    : { year: month.year, zeroIdx: month.zeroIdx + 1 };

  const baseFilter = areaFilter ? `&area=${areaFilter}` : "";

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
          List view
        </Link>
      </div>

      {/* Month nav + area filter */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Link
            href={`/portal/pm/calendar?month=${monthParam(prevMonth)}${baseFilter}`}
            style={navBtnStyle}
            title="Previous month"
          >
            <Icons.ChevronLeft width={14} height={14} />
          </Link>
          <span style={{ fontSize: 16, fontWeight: 700, padding: "0 12px", minWidth: 160, textAlign: "center" }}>
            {monthLabel(month)}
          </span>
          <Link
            href={`/portal/pm/calendar?month=${monthParam(nextMonth)}${baseFilter}`}
            style={navBtnStyle}
            title="Next month"
          >
            <Icons.ChevronRight width={14} height={14} />
          </Link>
          {(month.year !== today.getFullYear() || month.zeroIdx !== today.getMonth()) && (
            <Link
              href={`/portal/pm/calendar${baseFilter ? `?${baseFilter.slice(1)}` : ""}`}
              style={{ ...navBtnStyle, padding: "0 14px", fontSize: 12 }}
            >
              Today
            </Link>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--gw-fg-muted)", textTransform: "uppercase", letterSpacing: ".04em" }}>
            Area
          </span>
          <form
            method="get"
            action="/portal/pm/calendar"
            style={{ display: "inline-flex", gap: 4 }}
          >
            <input type="hidden" name="month" value={monthParam(month)} />
            <select
              name="area"
              defaultValue={areaFilter ?? ""}
              onChange={undefined}
              style={{
                padding: "6px 28px 6px 12px",
                height: 32,
                borderRadius: 8,
                border: "1px solid var(--gw-border)",
                background: "var(--gw-bg)",
                color: "var(--gw-fg)",
                fontSize: 12,
                fontWeight: 600,
                appearance: "none",
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 8px center",
              }}
            >
              <option value="">All areas</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              style={{
                padding: "0 12px",
                height: 32,
                borderRadius: 8,
                background: "var(--gw-bg-elev)",
                color: "var(--gw-fg)",
                border: "1px solid var(--gw-border)",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Apply
            </button>
          </form>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="rsd-card" style={{ padding: 0, overflow: "hidden", gap: 0 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            background: "var(--gw-bg-elev)",
            borderBottom: "1px solid var(--gw-border)",
          }}
        >
          {DOW_LABELS.map((d) => (
            <div
              key={d}
              style={{
                padding: "10px 12px",
                fontSize: 11,
                fontWeight: 700,
                color: "var(--gw-fg-muted)",
                textTransform: "uppercase",
                letterSpacing: ".06em",
                textAlign: "left",
              }}
            >
              {d}
            </div>
          ))}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            gridAutoRows: "minmax(110px, auto)",
          }}
        >
          {days.map((d, i) => {
            const iso = isoDate(d);
            const inMonth = d.getMonth() === month.zeroIdx;
            const isToday = d.getTime() === today.getTime();
            const isPast = d < today;
            const items = byDate.get(iso) ?? [];
            const rowEnd = (i + 1) % 7 === 0;

            return (
              <div
                key={iso}
                style={{
                  padding: 8,
                  borderRight: rowEnd ? "none" : "1px solid var(--gw-border)",
                  borderBottom:
                    i >= days.length - 7 ? "none" : "1px solid var(--gw-border)",
                  background: isToday
                    ? "var(--rsd-accent-bg)"
                    : inMonth
                    ? "var(--gw-bg)"
                    : "var(--gw-bg-elev)",
                  opacity: inMonth ? (isPast && !isToday ? 0.7 : 1) : 0.45,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: isToday ? 800 : 600,
                      color: isToday ? "var(--rsd-accent)" : "var(--gw-fg)",
                    }}
                  >
                    {d.getDate()}
                  </span>
                  {items.length > 0 && (
                    <span style={{ fontSize: 10, color: "var(--gw-fg-muted)", fontWeight: 600 }}>
                      {items.length}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                  {items.slice(0, 3).map((inst) => (
                    <CalendarPill key={inst.id} instance={inst} />
                  ))}
                  {items.length > 3 && (
                    <Link
                      href={`/portal/pm?status=all${
                        areaFilter ? `&area=${areaFilter}` : ""
                      }`}
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: "var(--gw-fg-muted)",
                        textDecoration: "none",
                        padding: "1px 6px",
                      }}
                    >
                      +{items.length - 3} more
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function CalendarPill({ instance }: { instance: InstanceRow }) {
  const chipClass = instance.priority?.chip_class ?? "rsd-chip-mute";
  const isClosed = instance.status === "done" || instance.status === "skipped";
  return (
    <Link
      href={`/portal/pm/${instance.id}`}
      title={`${instance.title} · ${instance.area?.name ?? "no area"}`}
      className={`rsd-chip ${chipClass}`}
      style={{
        display: "block",
        fontSize: 10,
        fontWeight: 700,
        padding: "2px 6px",
        textDecoration: "none",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        opacity: isClosed ? 0.55 : 1,
        textDecorationLine: instance.status === "done" ? "line-through" : "none",
      }}
    >
      {instance.title}
    </Link>
  );
}

function parseMonth(raw: string | undefined): { year: number; zeroIdx: number } {
  const now = new Date();
  if (!raw) return { year: now.getFullYear(), zeroIdx: now.getMonth() };
  const match = raw.match(/^(\d{4})-(\d{2})$/);
  if (!match) return { year: now.getFullYear(), zeroIdx: now.getMonth() };
  const year = Number(match[1]);
  const monthNum = Number(match[2]);
  if (year < 1900 || year > 2200 || monthNum < 1 || monthNum > 12) {
    return { year: now.getFullYear(), zeroIdx: now.getMonth() };
  }
  return { year, zeroIdx: monthNum - 1 };
}

function monthParam(m: { year: number; zeroIdx: number }): string {
  return `${m.year}-${String(m.zeroIdx + 1).padStart(2, "0")}`;
}

function monthLabel(m: { year: number; zeroIdx: number }): string {
  const d = new Date(m.year, m.zeroIdx, 1);
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const navBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 32,
  height: 32,
  borderRadius: 8,
  background: "var(--gw-bg-elev)",
  color: "var(--gw-fg)",
  border: "1px solid var(--gw-border)",
  fontSize: 13,
  fontWeight: 700,
  textDecoration: "none",
};
