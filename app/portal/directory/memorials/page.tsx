import Link from "next/link";
import { Icons } from "../../../components/icons";
import { AccessDenied } from "../_shared/AccessDenied";
import { loadMembers, loadViewer, type DirectoryMember } from "../_shared/data";
import { displayName } from "../_shared/format";

function formatFullDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "—";
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function yearsLived(birth: string | null, death: string | null): number | null {
  if (!birth || !death) return null;
  const by = Number(birth.slice(0, 4));
  const dy = Number(death.slice(0, 4));
  if (!by || !dy) return null;
  return dy - by;
}

export default async function MemorialsPage() {
  const viewer = await loadViewer();
  if (!viewer) return <AccessDenied />;

  const members = await loadMembers({ categories: ["memorial"], includeMemorials: true });
  // Newest deaths first.
  const sorted = [...members].sort((a, b) =>
    (b.deceased_at ?? "").localeCompare(a.deceased_at ?? "")
  );

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
            In remembrance
          </div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-.02em" }}>
            Asleep in Jesus
          </h2>
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

      <div className="rsd-card" style={{ padding: 0, gap: 0, overflow: "hidden" }}>
        {sorted.length === 0 ? (
          <div style={{ padding: "40px 24px", textAlign: "center", color: "var(--gw-fg-muted)", fontSize: 13 }}>
            No entries.
          </div>
        ) : (
          sorted.map((m, i) => (
            <MemorialRow key={m.id} member={m} border={i < sorted.length - 1} />
          ))
        )}
      </div>
    </>
  );
}

function MemorialRow({ member, border }: { member: DirectoryMember; border: boolean }) {
  const years = yearsLived(member.birthday, member.deceased_at);
  return (
    <Link
      href={`/portal/directory/${member.id}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "14px 18px",
        borderBottom: border ? "1px solid var(--gw-border)" : "none",
        textDecoration: "none",
        color: "var(--gw-fg)",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--gw-fg)" }}>
          {displayName(member)}
          {member.nickname && (
            <span style={{ marginLeft: 8, fontStyle: "italic", color: "var(--gw-fg-muted)", fontWeight: 500 }}>
              ({member.nickname})
            </span>
          )}
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--gw-fg-muted)",
            fontWeight: 500,
            marginTop: 4,
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <span>Born {formatFullDate(member.birthday)}</span>
          <span>·</span>
          <span>Asleep {formatFullDate(member.deceased_at)}</span>
          {years != null && <span style={{ color: "var(--gw-fg-faint)" }}>· {years} years</span>}
        </div>
      </div>
    </Link>
  );
}
