import Link from "next/link";
import { Icons } from "../../../../components/icons";
import { Avatar } from "../../_shared/Avatar";
import { displayName, formatMonthDay, lastNameLower } from "../../_shared/format";
import type { DirectoryMember } from "../../_shared/data";
import type { Household } from "../../_shared/households";

export function FamilyView({
  household,
  currentMemberId,
}: {
  household: Household;
  currentMemberId: string;
}) {
  const surname = capitalize(lastNameLower(household.heads[0])) || "Family";
  const allChildren: { member: DirectoryMember; adult: boolean }[] = [
    ...household.children.map((m) => ({ member: m, adult: false })),
    ...household.adultChildren.map((m) => ({ member: m, adult: true })),
  ].sort((a, b) =>
    (a.member.birthday ?? "").localeCompare(b.member.birthday ?? "")
  );

  const isCouple = household.heads.length === 2;
  const headLabels = isCouple
    ? (["Husband", "Wife"] as const)
    : ([null] as const);

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <Link
            href="/portal/directory/households"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              fontWeight: 700,
              color: "var(--gw-fg-muted)",
              textDecoration: "none",
              marginBottom: 8,
            }}
          >
            <Icons.ChevronLeft width={14} height={14} />
            All households
          </Link>
          <div className="rsd-eyebrow" style={{ marginBottom: 6 }}>
            Family
          </div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-.02em" }}>
            {surname}
          </h2>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${household.heads.length}, minmax(0, 1fr))`,
          gap: 12,
        }}
      >
        {household.heads.map((h, i) => (
          <ParentCard
            key={h.id}
            member={h}
            label={headLabels[i] ?? null}
            isSelf={h.id === currentMemberId}
          />
        ))}
      </div>

      {allChildren.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="rsd-eyebrow">
            Children ({allChildren.length})
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
              gap: 10,
            }}
          >
            {allChildren.map(({ member, adult }) => (
              <ChildCard
                key={member.id}
                member={member}
                adult={adult}
                isSelf={member.id === currentMemberId}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function ParentCard({
  member,
  label,
  isSelf,
}: {
  member: DirectoryMember;
  label: "Husband" | "Wife" | null;
  isSelf: boolean;
}) {
  const birthday = formatMonthDay(member.birthday);
  const anniversary = formatMonthDay(member.anniversary);

  return (
    <Link
      href={`/portal/directory/${member.id}`}
      className="rsd-card"
      style={{
        flexDirection: "column",
        gap: 10,
        padding: "16px 18px",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Avatar member={member} size={56} />
        <div style={{ flex: 1, minWidth: 0 }}>
          {label && (
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "var(--gw-fg-muted)",
                textTransform: "uppercase",
                letterSpacing: ".06em",
                marginBottom: 2,
              }}
            >
              {label}
            </div>
          )}
          <div
            style={{
              fontSize: 16,
              fontWeight: 800,
              color: "var(--gw-fg)",
              display: "flex",
              alignItems: "center",
              gap: 6,
              flexWrap: "wrap",
              lineHeight: 1.2,
            }}
          >
            {displayName(member)}
            {isSelf && <span className="rsd-chip rsd-chip-mute">You</span>}
          </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          fontSize: 12,
          color: "var(--gw-fg-muted)",
          fontWeight: 500,
        }}
      >
        {member.phone && (
          <ContactInline icon={<Icons.Phone width={11} height={11} />}>
            {member.phone}
          </ContactInline>
        )}
        {member.email && (
          <ContactInline icon={<Icons.Mail width={11} height={11} />}>
            <span
              style={{
                maxWidth: 220,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {member.email}
            </span>
          </ContactInline>
        )}
        {birthday && (
          <ContactInline icon={<Icons.Calendar width={11} height={11} />}>
            {birthday}
          </ContactInline>
        )}
        {anniversary && (
          <ContactInline icon={<Icons.Heart width={11} height={11} />}>
            {anniversary}
          </ContactInline>
        )}
      </div>
    </Link>
  );
}

function ChildCard({
  member,
  adult,
  isSelf,
}: {
  member: DirectoryMember;
  adult: boolean;
  isSelf: boolean;
}) {
  const birthday = formatMonthDay(member.birthday);
  return (
    <Link
      href={`/portal/directory/${member.id}`}
      className="rsd-card"
      style={{
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        padding: "14px 12px",
        textDecoration: "none",
        color: "inherit",
        textAlign: "center",
      }}
    >
      <Avatar member={member} size={48} />
      <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--gw-fg)", lineHeight: 1.2 }}>
          {displayName(member)}
        </span>
        {birthday && (
          <span style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
            {birthday}
          </span>
        )}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "center" }}>
          {adult && member.directory_category === "extended" && (
            <span className="rsd-chip rsd-chip-mute">Extended</span>
          )}
          {adult && member.directory_category !== "extended" && (
            <span className="rsd-chip rsd-chip-accent">Adult</span>
          )}
          {isSelf && <span className="rsd-chip rsd-chip-mute">You</span>}
        </div>
      </div>
    </Link>
  );
}

function ContactInline({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
      }}
    >
      {icon}
      {children}
    </span>
  );
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
