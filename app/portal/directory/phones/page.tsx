import Link from "next/link";
import { Icons } from "../../../components/icons";
import { AccessDenied } from "../_shared/AccessDenied";
import { loadMembers, loadViewer, type DirectoryMember } from "../_shared/data";
import { displayName, lastNameLower } from "../_shared/format";

function normalizeAddress(addr: string | null): string {
  if (!addr) return "__none__";
  return addr.toLowerCase().replace(/\s+/g, " ").trim();
}

export default async function PhoneTreePage() {
  const viewer = await loadViewer();
  if (!viewer) return <AccessDenied />;

  const members = await loadMembers({ categories: ["regular"] });

  // Group by address. Members with no address bucket into "no address".
  const groups = new Map<string, DirectoryMember[]>();
  for (const m of members) {
    const k = normalizeAddress(m.address);
    const arr = groups.get(k) ?? [];
    arr.push(m);
    groups.set(k, arr);
  }
  // Order each household by birthday ascending (adults first).
  for (const arr of groups.values()) {
    arr.sort((a, b) => (a.birthday ?? "9999").localeCompare(b.birthday ?? "9999"));
  }
  // Order households by head's last name.
  const ordered = [...groups.entries()].sort(([, a], [, b]) =>
    lastNameLower(a[0]).localeCompare(lastNameLower(b[0]))
  );

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
        {ordered.map(([key, list], i) => {
          const head = list[0];
          const home = list.find((m) => m.home_phone)?.home_phone ?? null;
          const last = head.full_name?.split(/\s+/).slice(-1)[0] ?? "";
          return (
            <div
              key={key}
              style={{
                padding: "12px 18px",
                borderBottom: i < ordered.length - 1 ? "1px solid var(--gw-border)" : "none",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 10,
                  marginBottom: 4,
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    color: "var(--gw-fg)",
                    textTransform: "uppercase",
                    letterSpacing: ".04em",
                  }}
                >
                  {last || displayName(head)}
                </span>
                {home && (
                  <a
                    href={`tel:${home}`}
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--gw-fg-muted)",
                      textDecoration: "none",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <Icons.Home width={11} height={11} />
                    {home}
                  </a>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {list.map((m) => (
                  <PhoneRow key={m.id} member={m} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function PhoneRow({ member }: { member: DirectoryMember }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "3px 0 3px 12px",
        gap: 12,
        fontSize: 13,
      }}
    >
      <Link
        href={`/portal/directory/${member.id}`}
        style={{ fontWeight: 600, color: "var(--gw-fg)", textDecoration: "none" }}
      >
        {displayName(member)}
      </Link>
      {member.phone ? (
        <a
          href={`tel:${member.phone}`}
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--gw-fg-muted)",
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <Icons.Phone width={11} height={11} />
          {member.phone}
        </a>
      ) : (
        <span style={{ fontSize: 11, color: "var(--gw-fg-faint)", fontStyle: "italic" }}>
          no cell
        </span>
      )}
    </div>
  );
}
