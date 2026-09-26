import Link from "next/link";
import { Icons } from "../../../components/icons";
import { AccessDenied } from "../_shared/AccessDenied";
import {
  loadMembers,
  loadRelationships,
  loadViewer,
  type DirectoryMember,
} from "../_shared/data";
import {
  anniversaryMilestone,
  dayOf,
  firstName,
  lastNameLower,
  monthName,
  monthOf,
} from "../_shared/format";

const CURRENT_YEAR = new Date().getFullYear();

interface Couple {
  memberA: DirectoryMember;
  memberB: DirectoryMember;
  anniversary: string;
}

export default async function AnniversariesPage() {
  // Started before the viewer check on purpose — see loadViewer().
  const data = Promise.all([
    loadMembers({ categories: ["regular", "extended"] }),
    loadRelationships(),
  ]);
  const viewer = await loadViewer();
  if (!viewer) return <AccessDenied />;

  const [members, rels] = await data;

  const memberById = new Map(members.map((m) => [m.id, m]));

  // Build couples from spouse relationships, deduped (only keep where memberA.id < memberB.id).
  const seen = new Set<string>();
  const couples: Couple[] = [];
  for (const r of rels) {
    if (r.relationship !== "spouse") continue;
    const aId = r.member_id < r.related_member_id ? r.member_id : r.related_member_id;
    const bId = r.member_id < r.related_member_id ? r.related_member_id : r.member_id;
    const k = `${aId}|${bId}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const a = memberById.get(aId);
    const b = memberById.get(bId);
    if (!a || !b || !a.anniversary) continue;
    couples.push({ memberA: a, memberB: b, anniversary: a.anniversary });
  }

  // Group by month.
  const byMonth = new Map<number, Couple[]>();
  for (const c of couples) {
    const month = monthOf(c.anniversary);
    if (!month) continue;
    const arr = byMonth.get(month) ?? [];
    arr.push(c);
    byMonth.set(month, arr);
  }
  for (const arr of byMonth.values()) {
    arr.sort((a, b) => {
      const da = dayOf(a.anniversary) ?? 0;
      const db = dayOf(b.anniversary) ?? 0;
      if (da !== db) return da - db;
      return lastNameLower(a.memberA).localeCompare(lastNameLower(b.memberA));
    });
  }

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
          href="/portal/directory"
          prefetch={false}
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
                {list.map((c, idx) => (
                  <AnniversaryRow key={`${c.memberA.id}-${c.memberB.id}`} couple={c} border={idx < list.length - 1} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

function AnniversaryRow({ couple, border }: { couple: Couple; border: boolean }) {
  const day = dayOf(couple.anniversary);
  const year = Number(couple.anniversary.slice(0, 4));
  const milestone = anniversaryMilestone(couple.anniversary, CURRENT_YEAR);
  const last = couple.memberA.full_name?.split(/\s+/).slice(-1)[0] ?? "";
  const lastB = couple.memberB.full_name?.split(/\s+/).slice(-1)[0] ?? "";
  // Format "LASTNAME — First & First" when shared, else "First Last & First Last".
  const label =
    last && last === lastB
      ? `${last.toUpperCase()} — ${firstName(couple.memberA)} & ${firstName(couple.memberB)}`
      : `${couple.memberA.full_name ?? "?"} & ${couple.memberB.full_name ?? "?"}`;

  // No prefetch: in a list this long, every row scrolled into view would fire
  // a background request (and a middleware auth check). The page is dynamic,
  // so a click costs the same either way.
  return (
    <Link
      href={`/portal/directory/${couple.memberA.id}`}
      prefetch={false}
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
      <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 600, flexShrink: 0 }}>
        {year || "—"}
      </span>
      {milestone && (
        <span className="rsd-chip rsd-chip-accent" style={{ flexShrink: 0 }}>
          {milestone}
        </span>
      )}
    </Link>
  );
}
