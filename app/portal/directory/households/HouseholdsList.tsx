"use client";
import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icons } from "../../../components/icons";
import { Avatar } from "../_shared/Avatar";
import { displayName, firstName, lastNameLower } from "../_shared/format";
import type { DirectoryMember, DirectoryRelationship } from "../_shared/data";
import { computeHouseholds, type Household } from "../_shared/households";

export function HouseholdsList({
  members,
  relationships,
  currentMemberId,
}: {
  members: DirectoryMember[];
  relationships: DirectoryRelationship[];
  currentMemberId: string;
}) {
  const [query, setQuery] = useState("");
  const households = useMemo(() => {
    // Only show actual households: couples (with or without kids), or any
    // head with children / linked adult children. Solo singles with nobody
    // attached aren't really a household — they live in All Members.
    return computeHouseholds(members, relationships).filter(
      (h) =>
        h.heads.length > 1 ||
        h.children.length > 0 ||
        h.adultChildren.length > 0
    );
  }, [members, relationships]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return households;
    return households.filter((h) => {
      const all = [...h.heads, ...h.children];
      return all.some((m) =>
        (m.full_name ?? "").toLowerCase().includes(q) ||
        (m.email ?? "").toLowerCase().includes(q)
      );
    });
  }, [households, query]);

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

      <div style={{ position: "relative", maxWidth: 480 }}>
        <span
          style={{
            position: "absolute",
            left: 12,
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--gw-fg-muted)",
            display: "flex",
          }}
        >
          <Icons.Search width={14} height={14} />
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or email"
          style={{
            width: "100%",
            height: 40,
            padding: "0 12px 0 36px",
            borderRadius: 10,
            border: "1px solid var(--gw-border)",
            background: "var(--gw-bg)",
            color: "var(--gw-fg)",
            fontSize: 13,
            fontWeight: 500,
          }}
        />
      </div>

      <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 600 }}>
        {filtered.length} {filtered.length === 1 ? "household" : "households"}
        {query && ` matching "${query}"`}
      </div>

      {filtered.length === 0 ? (
        <div className="rsd-card" style={{ padding: "40px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
            {query ? "No matches." : "No members yet."}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((h) => (
            <HouseholdCard key={h.key} household={h} currentMemberId={currentMemberId} />
          ))}
        </div>
      )}
    </>
  );
}

// The per-member and per-family links on these cards don't prefetch. With
// ~150 cards, every link scrolled into view would otherwise fire a background
// request (each a Supabase auth check in middleware), and since these pages
// are dynamic a prefetch only fetched the route's shape — a click costs the
// same one request either way.
function HouseholdCard({
  household,
  currentMemberId,
}: {
  household: Household;
  currentMemberId: string;
}) {
  const router = useRouter();
  const familyHref = `/portal/directory/family/${household.heads[0].id}`;

  function handleCardClick(e: React.MouseEvent) {
    // Inner links/buttons handle their own navigation.
    if ((e.target as HTMLElement).closest("a, button")) return;
    router.push(familyHref);
  }

  return (
    <div
      className="rsd-card"
      onClick={handleCardClick}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") router.push(familyHref);
      }}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        padding: "14px 18px",
        cursor: "pointer",
      }}
    >
      <AvatarStack heads={household.heads} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 18,
            fontWeight: 800,
            letterSpacing: "-.02em",
            color: "var(--gw-fg)",
            lineHeight: 1.2,
            marginBottom: 8,
          }}
        >
          {householdSurname(household)}
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "stretch",
            gap: 16,
          }}
        >
          {household.heads.map((h, i) => (
            <Fragment key={h.id}>
              {i > 0 && (
                <div
                  aria-hidden
                  style={{
                    width: 1,
                    alignSelf: "stretch",
                    background: "var(--gw-border)",
                  }}
                />
              )}
              <HeadBlock
                member={h}
                isSelf={h.id === currentMemberId}
              />
            </Fragment>
          ))}
        </div>

        {household.parents.length > 0 && (
          <div
            style={{
              fontSize: 12,
              color: "var(--gw-fg-muted)",
              fontWeight: 500,
              marginTop: 6,
            }}
          >
            Child of{" "}
            {household.parents.map((p, i) => (
              <span key={p.id}>
                {i > 0 && " & "}
                <Link
                  href={`/portal/directory/${p.id}`}
                  prefetch={false}
                  style={{
                    color: "var(--gw-fg)",
                    textDecoration: "none",
                    fontWeight: 700,
                  }}
                >
                  {displayName(p)}
                </Link>
              </span>
            ))}
          </div>
        )}

        {(household.children.length > 0 || household.adultChildren.length > 0) && (
          <ChildrenGrid
            dependents={household.children}
            adults={household.adultChildren}
          />
        )}
      </div>

      <Link
        href={familyHref}
        prefetch={false}
        aria-label={`Open ${displayName(household.heads[0])} family`}
        style={{
          flexShrink: 0,
          color: "var(--gw-fg-muted)",
          padding: 6,
          display: "inline-flex",
        }}
      >
        <Icons.ChevronRight width={16} height={16} />
      </Link>
    </div>
  );
}

function householdSurname(h: Household): string {
  const raw = lastNameLower(h.heads[0]);
  if (!raw) return "Household";
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function HeadBlock({
  member,
  isSelf,
}: {
  member: DirectoryMember;
  isSelf: boolean;
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          flexWrap: "wrap",
          lineHeight: 1.2,
        }}
      >
        <Link
          href={`/portal/directory/${member.id}`}
          prefetch={false}
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: "var(--gw-fg)",
            textDecoration: "none",
          }}
        >
          {displayName(member)}
        </Link>
        {isSelf && <span className="rsd-chip rsd-chip-mute">You</span>}
      </div>
      {(member.phone || member.email) && (
        <div
          style={{
            fontSize: 12,
            color: "var(--gw-fg-muted)",
            fontWeight: 500,
            marginTop: 4,
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          {member.phone && (
            <a
              href={`tel:${member.phone}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                color: "var(--gw-fg-muted)",
                textDecoration: "none",
              }}
            >
              <Icons.Phone width={11} height={11} />
              {member.phone}
            </a>
          )}
          {member.email && (
            <a
              href={`mailto:${member.email}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                color: "var(--gw-fg-muted)",
                textDecoration: "none",
                maxWidth: "100%",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              <Icons.Mail width={11} height={11} />
              {member.email}
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function ChildrenGrid({
  dependents,
  adults,
}: {
  dependents: DirectoryMember[];
  adults: DirectoryMember[];
}) {
  const total = dependents.length + adults.length;
  const rows = Math.min(3, total);
  return (
    <div
      style={{
        marginTop: 10,
        marginLeft: 4,
        paddingLeft: 14,
        borderLeft: "1px solid var(--gw-border)",
        display: "grid",
        gridAutoFlow: "column",
        gridTemplateRows: `repeat(${rows}, auto)`,
        columnGap: 24,
        rowGap: 6,
        justifyContent: "start",
      }}
    >
      {dependents.map((c) => (
        <ChildLink key={c.id} member={c} adult={false} />
      ))}
      {adults.map((c) => (
        <ChildLink key={c.id} member={c} adult={true} />
      ))}
    </div>
  );
}

function ChildLink({ member, adult }: { member: DirectoryMember; adult: boolean }) {
  return (
    <Link
      href={`/portal/directory/${member.id}`}
      prefetch={false}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        color: adult ? "var(--rsd-accent)" : "var(--gw-fg)",
        textDecoration: "none",
      }}
    >
      <Avatar member={member} size={24} />
      <span style={{ fontSize: 13, fontWeight: 600 }}>{firstName(member)}</span>
    </Link>
  );
}

function AvatarStack({ heads }: { heads: DirectoryMember[] }) {
  // When no head has uploaded a personal photo, show a single grayscale
  // house icon — better than stacking two generic people silhouettes.
  const anyAvatar = heads.some((h) => h.avatar_url);
  if (!anyAvatar) {
    return (
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: "50%",
          flexShrink: 0,
          background: "var(--gw-bg-elev)",
          border: "1px solid var(--gw-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icons.Home width={20} height={20} style={{ color: "var(--gw-fg-muted)" }} />
      </div>
    );
  }
  if (heads.length === 1) return <Avatar member={heads[0]} size={44} />;
  return (
    <div style={{ display: "flex", flexShrink: 0, width: 64, height: 44, position: "relative" }}>
      <div style={{ position: "absolute", left: 0, top: 0, zIndex: 1 }}>
        <Avatar member={heads[0]} size={36} ringed />
      </div>
      <div style={{ position: "absolute", left: 26, top: 4, zIndex: 0 }}>
        <Avatar member={heads[1]} size={36} ringed />
      </div>
    </div>
  );
}
