"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Icons } from "../../components/icons";
import { ageFromDob } from "../../../lib/teams/age";
import type { DirectoryParent, DirectoryPlayer } from "./_shared/data";

const NO_GROUP = "No age group";

// "10U" → 10, so age groups sort youngest first; anything else goes last.
function groupOrder(group: string): number {
  const n = parseInt(group, 10);
  return Number.isNaN(n) ? Infinity : n;
}

function ageGroup(p: DirectoryPlayer): string {
  return p.age_group ?? p.team?.age_group ?? NO_GROUP;
}

// Sort key: last name, then the rest.
function sortName(p: DirectoryPlayer): string {
  const words = p.full_name.trim().toLowerCase().split(/\s+/);
  return `${words[words.length - 1]} ${words.join(" ")}`;
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function address(p: DirectoryPlayer): string | null {
  const cityLine = [p.city, [p.state, p.postal_code].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  return [p.address_line1, p.address_line2, cityLine].filter(Boolean).join(", ") || null;
}

const RELATIONSHIP_LABEL: Record<DirectoryParent["relationship"], string> = {
  father: "Father",
  mother: "Mother",
  guardian: "Guardian",
};

export function PlayersList({
  players,
  isStaff,
}: {
  players: DirectoryPlayer[];
  isStaff: boolean;
}) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("all");

  const groupNames = useMemo(
    () =>
      [...new Set(players.map(ageGroup))].sort(
        (a, b) => groupOrder(a) - groupOrder(b) || a.localeCompare(b)
      ),
    [players]
  );

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    const matches = players.filter((p) => {
      if (group !== "all" && ageGroup(p) !== group) return false;
      if (!q) return true;
      const people = [
        p.full_name,
        p.team?.name,
        p.email,
        ...p.parents.flatMap((pa) => [pa.member?.full_name, pa.member?.email]),
      ];
      if (people.filter(Boolean).join(" ").toLowerCase().includes(q)) return true;
      if (digits.length < 3) return false;
      return [p.phone, ...p.parents.map((pa) => pa.member?.phone)].some((ph) =>
        ph?.replace(/\D/g, "").includes(digits)
      );
    });
    matches.sort((a, b) => sortName(a).localeCompare(sortName(b)));
    return groupNames
      .map((g) => ({ group: g, players: matches.filter((p) => ageGroup(p) === g) }))
      .filter((g) => g.players.length > 0);
  }, [players, groupNames, query, group]);

  const shown = groups.reduce((n, g) => n + g.players.length, 0);
  const season = players[0]?.board?.season;

  return (
    <>
      {isStaff && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Link
            href="/portal/contacts"
            prefetch={false}
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "var(--gw-fg-muted)",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Icons.Briefcase width={12} height={12} />
            Vendor contacts
            <Icons.ChevronRight width={12} height={12} />
          </Link>
        </div>
      )}

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
            placeholder="Search players, parents, emails, or phones"
            aria-label="Search the directory"
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
        {groupNames.length > 1 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <FilterTab label="All ages" active={group === "all"} onClick={() => setGroup("all")} />
            {groupNames.map((g) => (
              <FilterTab key={g} label={g} active={group === g} onClick={() => setGroup(g)} />
            ))}
          </div>
        )}
      </div>

      <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 600 }}>
        {shown} {shown === 1 ? "player" : "players"}
        {season && ` · ${season} season`}
      </div>

      {players.length === 0 ? (
        <Empty text="No players yet. Registrations show up here once they're imported." />
      ) : groups.length === 0 ? (
        <Empty text="No matches." />
      ) : (
        groups.map((g) => (
          <section key={g.group} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <h2
              style={{
                margin: 0,
                fontSize: 13,
                fontWeight: 800,
                letterSpacing: ".06em",
                textTransform: "uppercase",
                color: "var(--gw-fg)",
                display: "flex",
                alignItems: "baseline",
                gap: 8,
              }}
            >
              {g.group}
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--gw-fg-muted)", letterSpacing: 0 }}>
                {g.players.length}
              </span>
            </h2>
            <div className="rsd-card" style={{ padding: 0, gap: 0, overflow: "hidden" }}>
              {g.players.map((p, i) => (
                <PlayerRow
                  key={p.id}
                  player={p}
                  isStaff={isStaff}
                  border={i < g.players.length - 1}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rsd-card" style={{ padding: "40px 24px", textAlign: "center" }}>
      <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>{text}</div>
    </div>
  );
}

function FilterTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
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

const muted: React.CSSProperties = { fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 500 };
const contactLink: React.CSSProperties = {
  color: "var(--gw-fg)",
  textDecoration: "none",
  overflowWrap: "anywhere",
};

function PlayerRow({
  player: p,
  isStaff,
  border,
}: {
  player: DirectoryPlayer;
  isStaff: boolean;
  border: boolean;
}) {
  const age = ageFromDob(p.dob);
  const born = formatDate(p.dob);
  const addr = address(p);
  const staffFacts = [
    p.registration_fee && `Fee: ${p.registration_fee}`,
    p.payment_method && `Paid by ${p.payment_method}`,
    p.shirt_size && `Shirt: ${p.shirt_size}`,
  ].filter(Boolean);

  return (
    <div
      id={`player-${p.id}`}
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
        gap: "12px 24px",
        padding: "14px 18px",
        borderBottom: border ? "1px solid var(--gw-border)" : "none",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--gw-fg)" }}>{p.full_name}</span>
          {p.team && <span className="rsd-chip rsd-chip-mute">{p.team.name}</span>}
          {p.new_to_program && <span className="rsd-chip rsd-chip-accent">New</span>}
          {isStaff && !p.waiver_signed && <span className="rsd-chip rsd-chip-error">No waiver</span>}
          {isStaff && !p.directory_optin && (
            <span className="rsd-chip rsd-chip-mute" title="The family said no to the directory; only staff see this player">
              Not in directory
            </span>
          )}
        </div>
        {(age != null || born) && (
          <div style={muted}>
            {age != null && `Age ${age}`}
            {age != null && born && " · "}
            {born && `Born ${born}`}
          </div>
        )}
        {addr && (
          <div style={{ ...muted, display: "flex", gap: 6, alignItems: "flex-start" }}>
            <Icons.MapPin width={12} height={12} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{addr}</span>
          </div>
        )}
        {(p.phone || p.email) && (
          <ContactLine phone={p.phone} email={p.email} label="Player" />
        )}
        {isStaff && staffFacts.length > 0 && <div style={muted}>{staffFacts.join(" · ")}</div>}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
        {p.parents.length === 0 ? (
          <div style={muted}>No parent info on the registration.</div>
        ) : (
          p.parents.map((pa) => <ParentBlock key={pa.member!.id} parent={pa} isStaff={isStaff} />)
        )}
      </div>
    </div>
  );
}

function ParentBlock({ parent, isStaff }: { parent: DirectoryParent; isStaff: boolean }) {
  const m = parent.member!;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: "var(--gw-fg-muted)",
            textTransform: "uppercase",
            letterSpacing: ".06em",
            minWidth: 52,
          }}
        >
          {RELATIONSHIP_LABEL[parent.relationship]}
        </span>
        <Link
          href={`/portal/directory/${m.id}`}
          prefetch={false}
          style={{ fontSize: 13, fontWeight: 700, color: "var(--gw-fg)", textDecoration: "none" }}
        >
          {m.full_name ?? m.email ?? "Unknown"}
        </Link>
        {isStaff && !m.user_id && m.email && (
          <span className="rsd-chip rsd-chip-mute">Not signed up</span>
        )}
      </div>
      <div style={{ paddingLeft: 60 }}>
        <ContactLine phone={m.phone} email={m.email} />
        {isStaff && m.volunteer_interests && (
          <div style={{ ...muted, marginTop: 2 }}>Can help: {m.volunteer_interests}</div>
        )}
      </div>
    </div>
  );
}

function ContactLine({
  phone,
  email,
  label,
}: {
  phone: string | null;
  email: string | null;
  label?: string;
}) {
  if (!phone && !email) return null;
  return (
    <div style={{ ...muted, display: "flex", gap: "2px 12px", flexWrap: "wrap" }}>
      {label && <span>{label}:</span>}
      {phone && (
        <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} style={contactLink}>
          {phone}
        </a>
      )}
      {email && (
        <a href={`mailto:${email}`} style={contactLink}>
          {email}
        </a>
      )}
    </div>
  );
}
