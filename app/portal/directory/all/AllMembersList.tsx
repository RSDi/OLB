"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Icons } from "../../../components/icons";
import { Avatar } from "../_shared/Avatar";
import { displayName, lastNameLower } from "../_shared/format";
import type { DirectoryMember } from "../_shared/data";

type CategoryFilter = "all" | "regular" | "extended";

export function AllMembersList({
  members,
  currentMemberId,
}: {
  members: DirectoryMember[];
  currentMemberId: string;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [hasEmail, setHasEmail] = useState(false);
  const [hasPhone, setHasPhone] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members
      .filter((m) => {
        if (category !== "all" && m.directory_category !== category) return false;
        if (hasEmail && !m.email) return false;
        if (hasPhone && !m.phone && !m.home_phone) return false;
        if (q) {
          const hay = [m.full_name, m.nickname, m.email].filter(Boolean).join(" ").toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const al = lastNameLower(a);
        const bl = lastNameLower(b);
        if (al !== bl) return al.localeCompare(bl);
        return displayName(a).localeCompare(displayName(b));
      });
  }, [members, query, category, hasEmail, hasPhone]);

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

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
            placeholder="Search by name, nickname, or email"
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
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <FilterTab label="All" active={category === "all"} onClick={() => setCategory("all")} />
          <FilterTab label="Regular" active={category === "regular"} onClick={() => setCategory("regular")} />
          <FilterTab label="Extended" active={category === "extended"} onClick={() => setCategory("extended")} />
          <span style={{ width: 1, height: 20, background: "var(--gw-border)", margin: "0 4px" }} />
          <ToggleChip label="Has email" active={hasEmail} onClick={() => setHasEmail((v) => !v)} />
          <ToggleChip label="Has phone" active={hasPhone} onClick={() => setHasPhone((v) => !v)} />
        </div>
      </div>

      <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 600 }}>
        {filtered.length} {filtered.length === 1 ? "member" : "members"}
      </div>

      {filtered.length === 0 ? (
        <div className="rsd-card" style={{ padding: "40px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
            No matches.
          </div>
        </div>
      ) : (
        <div className="rsd-card" style={{ padding: 0, gap: 0, overflow: "hidden" }}>
          {filtered.map((m, i) => (
            <MemberRow
              key={m.id}
              member={m}
              isSelf={m.id === currentMemberId}
              border={i < filtered.length - 1}
            />
          ))}
        </div>
      )}
    </>
  );
}

function FilterTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 14px",
        borderRadius: 8,
        background: active ? "var(--gw-bg-elev)" : "transparent",
        border: "1px solid",
        borderColor: active ? "var(--gw-border)" : "transparent",
        fontSize: 12,
        fontWeight: 700,
        color: active ? "var(--gw-fg)" : "var(--gw-fg-muted)",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function ToggleChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "5px 12px",
        borderRadius: 100,
        background: active ? "var(--rsd-accent-bg)" : "var(--gw-bg-elev)",
        color: active ? "var(--rsd-accent)" : "var(--gw-fg-muted)",
        border: "1px solid",
        borderColor: active ? "rgba(108,140,89,.25)" : "var(--gw-border)",
        fontSize: 11,
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function MemberRow({
  member,
  isSelf,
  border,
}: {
  member: DirectoryMember;
  isSelf: boolean;
  border: boolean;
}) {
  return (
    <Link
      href={`/portal/directory/${member.id}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "12px 18px",
        borderBottom: border ? "1px solid var(--gw-border)" : "none",
        textDecoration: "none",
        color: "var(--gw-fg)",
      }}
    >
      <Avatar member={member} size={36} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
            lineHeight: 1.2,
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 700 }}>{displayName(member)}</span>
          {isSelf && <span className="rsd-chip rsd-chip-mute">You</span>}
          {member.directory_category === "extended" && (
            <span className="rsd-chip rsd-chip-mute">Extended</span>
          )}
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--gw-fg-muted)",
            fontWeight: 500,
            marginTop: 2,
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          {member.email && (
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>
              {member.email}
            </span>
          )}
          {member.phone && <span>{member.phone}</span>}
        </div>
      </div>
      <Icons.ChevronRight width={14} height={14} style={{ color: "var(--gw-fg-muted)", flexShrink: 0 }} />
    </Link>
  );
}
