"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Icons } from "../../../components/icons";
import { Avatar } from "../_shared/Avatar";
import { displayName, firstName, lastNameLower } from "../_shared/format";
import type { DirectoryMember, DirectoryRelationship } from "../_shared/data";

interface Household {
  key: string;
  heads: DirectoryMember[];
  children: DirectoryMember[];
}

function normalizeAddress(addr: string | null): string | null {
  if (!addr) return null;
  return addr.toLowerCase().replace(/\s+/g, " ").trim();
}

function computeHouseholds(
  members: DirectoryMember[],
  rels: DirectoryRelationship[]
): Household[] {
  const memberById = new Map(members.map((m) => [m.id, m]));
  const approved = new Set(members.map((m) => m.id));

  const parentsOf = new Map<string, string[]>();
  const childrenOf = new Map<string, string[]>();
  const spouseOf = new Map<string, string>();

  for (const r of rels) {
    if (!approved.has(r.member_id) || !approved.has(r.related_member_id)) continue;
    if (r.relationship === "parent") {
      const arr = parentsOf.get(r.member_id) ?? [];
      arr.push(r.related_member_id);
      parentsOf.set(r.member_id, arr);
    } else if (r.relationship === "child") {
      const arr = childrenOf.get(r.member_id) ?? [];
      arr.push(r.related_member_id);
      childrenOf.set(r.member_id, arr);
    } else if (r.relationship === "spouse") {
      spouseOf.set(r.member_id, r.related_member_id);
    }
  }

  // Dependent = listed under a parent's household via relationships.
  // Married members or members with their own children always head their own.
  const isDependent = (id: string): boolean => {
    if ((parentsOf.get(id) ?? []).length === 0) return false;
    if (spouseOf.has(id)) return false;
    if ((childrenOf.get(id) ?? []).length > 0) return false;
    return true;
  };

  const heads = members.filter((m) => !isDependent(m.id));
  const headIds = new Set(heads.map((h) => h.id));

  // Pair couples. Skip the partner once handled.
  const seenAsPartner = new Set<string>();
  const households: Household[] = [];
  const placed = new Set<string>(); // ids already in a household

  for (const head of heads) {
    if (seenAsPartner.has(head.id)) continue;
    const spouseId = spouseOf.get(head.id);
    const spouse =
      spouseId && headIds.has(spouseId) ? memberById.get(spouseId) ?? null : null;
    if (spouse) seenAsPartner.add(spouse.id);

    const childIds = new Set<string>();
    for (const cid of childrenOf.get(head.id) ?? []) {
      if (isDependent(cid)) childIds.add(cid);
    }
    if (spouse) {
      for (const cid of childrenOf.get(spouse.id) ?? []) {
        if (isDependent(cid)) childIds.add(cid);
      }
    }
    const children = [...childIds]
      .map((id) => memberById.get(id))
      .filter((m): m is DirectoryMember => Boolean(m))
      .sort((a, b) => (a.birthday ?? "").localeCompare(b.birthday ?? ""));

    households.push({
      key: head.id,
      heads: spouse ? [head, spouse] : [head],
      children,
    });
    placed.add(head.id);
    if (spouse) placed.add(spouse.id);
    for (const c of children) placed.add(c.id);
  }

  // Address fallback — group any not-yet-placed members who share an exact
  // normalized address. Handles the sibling-only households (BACKENS R20)
  // where no anniversary or relationships exist.
  const byAddr = new Map<string, DirectoryMember[]>();
  for (const m of members) {
    if (placed.has(m.id)) continue;
    const key = normalizeAddress(m.address);
    if (!key) continue;
    const arr = byAddr.get(key) ?? [];
    arr.push(m);
    byAddr.set(key, arr);
  }
  for (const group of byAddr.values()) {
    if (group.length < 2) continue;
    // Order by birthday ascending (oldest first as head).
    const sorted = [...group].sort((a, b) =>
      (a.birthday ?? "").localeCompare(b.birthday ?? "")
    );
    households.push({
      key: `addr-${sorted[0].id}`,
      heads: [sorted[0]],
      children: sorted.slice(1),
    });
    for (const m of group) placed.add(m.id);
  }

  // Remaining unplaced members become solo households.
  for (const m of members) {
    if (placed.has(m.id)) continue;
    households.push({ key: m.id, heads: [m], children: [] });
  }

  households.sort((a, b) => {
    const al = lastNameLower(a.heads[0]);
    const bl = lastNameLower(b.heads[0]);
    if (al !== bl) return al.localeCompare(bl);
    return displayName(a.heads[0]).localeCompare(displayName(b.heads[0]));
  });

  return households;
}

export function HouseholdsList({
  members,
  relationships,
  currentMemberId,
  isSuperAdmin,
}: {
  members: DirectoryMember[];
  relationships: DirectoryRelationship[];
  currentMemberId: string;
  isSuperAdmin: boolean;
}) {
  const [query, setQuery] = useState("");
  const households = useMemo(
    () => computeHouseholds(members, relationships),
    [members, relationships]
  );

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
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <div className="rsd-eyebrow" style={{ marginBottom: 6 }}>
            Directory
          </div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-.02em" }}>
            Households
          </h2>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
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
          {isSuperAdmin && (
            <Link
              href="/portal/settings"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 18px",
                borderRadius: 100,
                background: "var(--gw-bg-elev)",
                color: "var(--gw-fg)",
                border: "1px solid var(--gw-border)",
                fontSize: 12,
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              <Icons.Cog width={14} height={14} />
              Manage members
            </Link>
          )}
        </div>
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

function HouseholdCard({
  household,
  currentMemberId,
}: {
  household: Household;
  currentMemberId: string;
}) {
  const phones = household.heads.filter((h) => h.phone);
  const emails = household.heads.filter((h) => h.email);

  return (
    <div
      className="rsd-card"
      style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: "14px 18px" }}
    >
      <AvatarStack heads={household.heads} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexWrap: "wrap",
            lineHeight: 1.2,
          }}
        >
          {household.heads.map((h, i) => (
            <span key={h.id} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              {i > 0 && (
                <span style={{ color: "var(--gw-fg-muted)", fontSize: 14, fontWeight: 700 }}>&</span>
              )}
              <Link
                href={`/portal/directory/${h.id}`}
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: "var(--gw-fg)",
                  textDecoration: "none",
                }}
              >
                {displayName(h)}
              </Link>
              {h.id === currentMemberId && <span className="rsd-chip rsd-chip-mute">You</span>}
            </span>
          ))}
        </div>

        {(phones.length > 0 || emails.length > 0) && (
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
            {phones.map((h) => (
              <a
                key={`p-${h.id}`}
                href={`tel:${h.phone}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  color: "var(--gw-fg-muted)",
                  textDecoration: "none",
                }}
              >
                <Icons.Phone width={11} height={11} />
                {h.phone}
              </a>
            ))}
            {emails.map((h) => (
              <a
                key={`e-${h.id}`}
                href={`mailto:${h.email}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  color: "var(--gw-fg-muted)",
                  textDecoration: "none",
                  maxWidth: 220,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                <Icons.Mail width={11} height={11} />
                {h.email}
              </a>
            ))}
          </div>
        )}

        {household.children.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {household.children.map((c) => (
              <Link
                key={c.id}
                href={`/portal/directory/${c.id}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "3px 10px",
                  borderRadius: 100,
                  background: "var(--gw-bg-elev)",
                  border: "1px solid var(--gw-border)",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "var(--gw-fg-muted)",
                  textDecoration: "none",
                }}
              >
                {firstName(c)}
              </Link>
            ))}
          </div>
        )}
      </div>

      <Link
        href={`/portal/directory/${household.heads[0].id}`}
        aria-label={`Open ${displayName(household.heads[0])}`}
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

function AvatarStack({ heads }: { heads: DirectoryMember[] }) {
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
