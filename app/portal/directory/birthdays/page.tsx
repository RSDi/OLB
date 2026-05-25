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
  const viewer = await loadViewer();
  if (!viewer) return <AccessDenied />;

  // Memorials excluded by default; we want living members' birthdays.
  const members = await loadMembers({ categories: ["regular", "extended"] });

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
      <PageHeader title="Birthdays" eyebrow={`${CURRENT_YEAR}`} />

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
          const list = byMonth.get(m) ?? [];
          if (list.length === 0) return null;
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
              </h3>
              <div className="rsd-card" style={{ padding: 0, gap: 0, overflow: "hidden" }}>
                {list.map((member, idx) => (
                  <BirthdayRow
                    key={member.id}
                    member={member}
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

function BirthdayRow({ member, border }: { member: DirectoryMember; border: boolean }) {
  const day = dayOf(member.birthday);
  const milestone = birthdayMilestone(member.birthday, CURRENT_YEAR);
  const age = ageInYear(member.birthday, CURRENT_YEAR);
  const wiffle = wiffleballFlag(member.birthday, CURRENT_YEAR);

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
      ) : age != null ? (
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

function PageHeader({ title, eyebrow }: { title: string; eyebrow: string }) {
  return (
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
          {eyebrow}
        </div>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-.02em" }}>{title}</h2>
      </div>
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
