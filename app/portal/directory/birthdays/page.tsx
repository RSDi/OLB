import Link from "next/link";
import { Icons } from "../../../components/icons";
import { AccessDenied } from "../_shared/AccessDenied";
import { loadMembers, loadViewer, type DirectoryMember } from "../_shared/data";
import {
  ageInYear,
  birthdayMilestone,
  dayOf,
  displayName,
  monthName,
  monthOf,
  wiffleballFlag,
} from "../_shared/format";

const CURRENT_YEAR = new Date().getFullYear();

export default async function BirthdaysPage() {
  // Memorials excluded by default; we want living members' birthdays.
  // Started before the viewer check on purpose — see loadViewer().
  const data = loadMembers({ categories: ["regular", "extended"] });
  const viewer = await loadViewer();
  if (!viewer) return <AccessDenied />;

  const members = await data;

  // Group by month.
  const byMonth = new Map<number, DirectoryMember[]>();
  for (const m of members) {
    const month = monthOf(m.birthday);
    if (!month) continue;
    const arr = byMonth.get(month) ?? [];
    arr.push(m);
    byMonth.set(month, arr);
  }
  // Sort each month by day, then by name.
  for (const arr of byMonth.values()) {
    arr.sort((a, b) => {
      const da = dayOf(a.birthday) ?? 0;
      const db = dayOf(b.birthday) ?? 0;
      if (da !== db) return da - db;
      return displayName(a).localeCompare(displayName(b));
    });
  }

  return (
    <>
      <PageHeader />

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {/* Start at the current month ("who's coming up?") and wrap around the
            year; wrapped months belong to next year for ages/milestones. */}
        {Array.from({ length: 12 }, (_, i) => ((new Date().getMonth() + i) % 12) + 1).map((m, i) => {
          const list = byMonth.get(m) ?? [];
          if (list.length === 0) return null;
          const wrapped = m < new Date().getMonth() + 1;
          const year = wrapped ? CURRENT_YEAR + 1 : CURRENT_YEAR;
          return (
            <section key={m}>
              <h3
                style={{
                  margin: "0 0 8px",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--gw-fg-muted)",
                  textTransform: "uppercase",
                  letterSpacing: ".06em",
                }}
              >
                {monthName(m)}
                {wrapped ? ` ${year}` : i === 0 ? " — this month" : ""}
              </h3>
              <div className="rsd-card" style={{ padding: 0, gap: 0, overflow: "hidden" }}>
                {list.map((member, idx) => (
                  <BirthdayRow
                    key={member.id}
                    member={member}
                    year={year}
                    border={idx < list.length - 1}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

function BirthdayRow({
  member,
  year,
  border,
}: {
  member: DirectoryMember;
  year: number;
  border: boolean;
}) {
  const day = dayOf(member.birthday);
  const milestone = birthdayMilestone(member.birthday, year);
  const age = ageInYear(member.birthday, year);
  const wiffle = wiffleballFlag(member.birthday, year);

  return (
    <Link
      href={`/portal/directory/${member.id}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "10px 18px",
        borderBottom: border ? "1px solid var(--gw-border)" : "none",
        textDecoration: "none",
        color: "var(--gw-fg)",
      }}
    >
      <span
        style={{
          width: 28,
          textAlign: "right",
          fontSize: 13,
          fontWeight: 800,
          color: "var(--gw-fg-muted)",
          flexShrink: 0,
        }}
      >
        {day ?? "—"}
      </span>
      <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{displayName(member)}</span>
      {milestone ? (
        <span className="rsd-chip rsd-chip-accent" style={{ flexShrink: 0 }}>
          {milestone}
        </span>
      ) : age != null && age > 0 ? (
        <span
          style={{
            flexShrink: 0,
            fontSize: 12,
            fontWeight: 600,
            color: "var(--gw-fg-muted)",
          }}
        >
          turns {age}
        </span>
      ) : null}
      {wiffle && (
        <span
          className="rsd-chip"
          style={{
            flexShrink: 0,
            background: wiffle === "eligible" ? "rgb(254,243,199)" : "var(--gw-bg-elev)",
            color: wiffle === "eligible" ? "#92400e" : "var(--gw-fg-muted)",
            borderColor: "transparent",
          }}
        >
          Wiffleball {wiffle === "eligible" ? "E" : "R"}
        </span>
      )}
    </Link>
  );
}

function PageHeader() {
  return (
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
        href="/portal/directory"
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: "var(--gw-fg-muted)",
          textDecoration: "none",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <Icons.ChevronLeft width={12} height={12} />
        All views
      </Link>
    </div>
  );
}
