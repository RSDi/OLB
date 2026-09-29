"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Icons } from "../../components/icons";
import { ClearSearchButton } from "../../components/ui";
import { ageFromDob } from "../../../lib/teams/age";
import type { DirectoryParent, DirectoryPlayer } from "./_shared/data";
import { JerseyNumber, TeamBanner, TeamDot } from "./_shared/TeamBanner";
import type { OlbVolunteerRole } from "../../../lib/teams/types";
import type { TeamWithStaff } from "../../../lib/teams/volunteer-data";
import { teamLabel } from "../../../lib/teams/volunteer-options";
import type { PlayerRequirement, Requirement } from "../../../lib/requirements/types";
import {
  doneWord,
  indexRows,
  requirementLabel,
  rowKey,
  stateFor,
  type RequirementState,
} from "../../../lib/requirements/logic";
import { RequirementDialog } from "./RequirementDialog";

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

type View = "team" | "age";
const NO_TEAM = "none";
// The board's requirement filter: who's still missing it, who's handled it.
type ReqShow = "missing" | "done" | "waived" | "all";

export function PlayersList({
  players,
  isStaff,
  teams,
  roles,
  canViewAges,
  requirements,
  requirementRows,
}: {
  players: DirectoryPlayer[];
  isStaff: boolean;
  teams: TeamWithStaff[];
  roles: OlbVolunteerRole[];
  canViewAges: boolean;
  // Staff only (0098); empty for everyone else.
  requirements: Requirement[];
  requirementRows: PlayerRequirement[];
}) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("team");
  const [teamId, setTeamId] = useState("all");
  const [group, setGroup] = useState("all");
  const [reqId, setReqId] = useState("all");
  const [reqShow, setReqShow] = useState<ReqShow>("missing");
  const [open, setOpen] = useState<{ player: DirectoryPlayer; requirement: Requirement } | null>(null);

  const rows = useMemo(() => indexRows(requirementRows), [requirementRows]);
  const pickedReq = requirements.find((r) => r.id === reqId) ?? null;

  const groupNames = useMemo(
    () =>
      [...new Set(players.map(ageGroup))].sort(
        (a, b) => groupOrder(a) - groupOrder(b) || a.localeCompare(b)
      ),
    [players]
  );

  const countByTeam = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of players) {
      const k = p.team_id ?? NO_TEAM;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [players]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    const list = players.filter((p) => {
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
    return list.sort((a, b) => sortName(a).localeCompare(sortName(b)));
  }, [players, query]);

  // Sections to render: one per age group, or one per team (a single team
  // when one is picked), plus players not on a team yet.
  const sections = useMemo(() => {
    if (view === "age") {
      return groupNames
        .filter((g) => group === "all" || g === group)
        .map((g) => ({ key: g, title: g, team: null as TeamWithStaff | null, players: matches.filter((p) => ageGroup(p) === g) }))
        .filter((g) => g.players.length > 0);
    }
    const picked = teamId === "all" ? teams : teams.filter((t) => t.id === teamId);
    const out = picked.map((t) => ({
      key: t.id,
      title: teamLabel(t),
      team: t as TeamWithStaff | null,
      players: matches.filter((p) => p.team_id === t.id),
    }));
    if (teamId === "all" || teamId === NO_TEAM) {
      out.push({ key: NO_TEAM, title: "Not on a team yet", team: null, players: matches.filter((p) => !p.team_id) });
    }
    return out.filter((g) => g.players.length > 0 || (teamId !== "all" && g.team));
  }, [view, groupNames, group, matches, teams, teamId]);

  // With a requirement picked: how the players in view stand on it, and the
  // sections narrowed to the ones asked for. Players it doesn't apply to drop out.
  const reqCounts = useMemo(() => {
    const c: Record<RequirementState, number> = { done: 0, waived: 0, missing: 0, "n/a": 0 };
    if (!pickedReq) return c;
    for (const g of sections) for (const p of g.players) c[stateFor(p, pickedReq, rows)]++;
    return c;
  }, [sections, pickedReq, rows]);

  const shownSections = useMemo(() => {
    if (!pickedReq) return sections;
    return sections.map((g) => ({
      ...g,
      players: g.players.filter((p) => {
        const st = stateFor(p, pickedReq, rows);
        return st !== "n/a" && (reqShow === "all" || st === reqShow);
      }),
    }));
  }, [sections, pickedReq, rows, reqShow]);

  const pickedTeam = view === "team" && teamId !== "all" ? teams.find((t) => t.id === teamId) ?? null : null;
  const shown = shownSections.reduce((n, g) => n + g.players.length, 0);
  const reqTotal = reqCounts.done + reqCounts.waived + reqCounts.missing;
  const season = players[0]?.board?.season;

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <div data-tour="directory-search" style={{ position: "relative", flex: "1 1 320px", maxWidth: 480 }}>
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
                padding: "0 40px 0 36px",
                borderRadius: 10,
                border: "1px solid var(--gw-border)",
                background: "var(--gw-bg)",
                color: "var(--gw-fg)",
                fontSize: 13,
                fontWeight: 500,
              }}
            />
            {query && <ClearSearchButton onClear={() => setQuery("")} />}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {canViewAges && (
              <div
                role="group"
                aria-label="Group the directory"
                data-tour="directory-view"
                style={{ display: "inline-flex", gap: 2, padding: 3, borderRadius: 10, background: "var(--gw-border)" }}
              >
                <SegButton label="By team" active={view === "team"} onClick={() => setView("team")} />
                <SegButton label="By age group" active={view === "age"} onClick={() => setView("age")} />
              </div>
            )}
          </div>
        </div>

        {view === "team" ? (
          teams.length > 0 && (
            <div data-tour="directory-teams" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <TeamChip label="All teams" active={teamId === "all"} onClick={() => setTeamId("all")} />
              {teams.map((t) => (
                <TeamChip
                  key={t.id}
                  label={teamLabel(t)}
                  color={t.color}
                  count={countByTeam.get(t.id) ?? 0}
                  active={teamId === t.id}
                  onClick={() => setTeamId(t.id)}
                />
              ))}
              {(countByTeam.get(NO_TEAM) ?? 0) > 0 && (
                <TeamChip
                  label="No team yet"
                  count={countByTeam.get(NO_TEAM) ?? 0}
                  active={teamId === NO_TEAM}
                  onClick={() => setTeamId(NO_TEAM)}
                />
              )}
            </div>
          )
        ) : (
          groupNames.length > 1 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <FilterTab label="All ages" active={group === "all"} onClick={() => setGroup("all")} />
              {groupNames.map((g) => (
                <FilterTab key={g} label={g} active={group === g} onClick={() => setGroup(g)} />
              ))}
            </div>
          )
        )}
      </div>

      {isStaff && requirements.length > 0 && (
        <div data-tour="directory-requirements" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select
            value={reqId}
            onChange={(e) => {
              setReqId(e.target.value);
              setReqShow("missing");
            }}
            aria-label="Filter by requirement"
            data-tour="requirement-filter"
            className="rsd-chip"
            style={{ height: 34, padding: "0 12px", borderRadius: 100, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
          >
            <option value="all">All requirements</option>
            {requirements.map((r) => (
              <option key={r.id} value={r.id}>
                {requirementLabel(r)}
              </option>
            ))}
          </select>
          {pickedReq && (
            <div
              role="group"
              aria-label={`Show players by ${pickedReq.name}`}
              data-tour="requirement-status"
              style={{ display: "inline-flex", gap: 2, padding: 3, borderRadius: 10, background: "var(--gw-border)" }}
            >
              <SegButton label={`Missing ${reqCounts.missing}`} active={reqShow === "missing"} onClick={() => setReqShow("missing")} />
              <SegButton
                label={`${doneWord(pickedReq.kind)} ${reqCounts.done}`}
                active={reqShow === "done"}
                onClick={() => setReqShow("done")}
              />
              {(reqCounts.waived > 0 || reqShow === "waived") && (
                <SegButton label={`Waived ${reqCounts.waived}`} active={reqShow === "waived"} onClick={() => setReqShow("waived")} />
              )}
              <SegButton label="All" active={reqShow === "all"} onClick={() => setReqShow("all")} />
            </div>
          )}
        </div>
      )}

      {pickedTeam && (
        <TeamBanner team={pickedTeam} roles={roles} playerCount={countByTeam.get(pickedTeam.id) ?? 0} />
      )}

      <div data-tour="requirement-summary" style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 600 }}>
        {shown} {shown === 1 ? "player" : "players"}
        {season && ` · ${season} season`}
        {pickedReq &&
          ` · ${pickedReq.name}: ${reqCounts.done + reqCounts.waived} of ${reqTotal} ${pickedReq.kind === "fee" ? "paid" : "done"}` +
            (reqCounts.waived > 0 ? ` (${reqCounts.waived} waived)` : "")}
      </div>

      {players.length === 0 ? (
        <Empty text="No players yet. Registrations show up here once they're imported." />
      ) : shown === 0 ? (
        <Empty
          text={
            pickedReq && reqShow === "missing" && reqTotal > 0
              ? `Nobody here is missing ${pickedReq.name}.`
              : pickedReq && reqShow !== "all" && reqTotal > 0
                ? "No players match."
                : query
                  ? "No matches."
                  : "No players on this team yet."
          }
        />
      ) : (
        shownSections
          .filter((g) => g.players.length > 0)
          .map((g) => (
            <section key={g.key} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {!pickedTeam && (
                <h2
                  style={{
                    margin: 0,
                    fontSize: 13,
                    fontWeight: 800,
                    letterSpacing: ".06em",
                    textTransform: "uppercase",
                    color: "var(--gw-fg)",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  {g.team && <TeamDot color={g.team.color} />}
                  {g.title}
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--gw-fg-muted)", letterSpacing: 0 }}>
                    {g.players.length}
                  </span>
                  {g.team && (
                    <Link
                      href={`/portal/directory/teams/${g.team.id}`}
                      prefetch={false}
                      data-tour="directory-team-page"
                      style={{
                        marginLeft: "auto",
                        fontSize: 12,
                        fontWeight: 700,
                        letterSpacing: 0,
                        textTransform: "none",
                        color: "var(--gw-fg-muted)",
                        textDecoration: "none",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      Team page
                      <Icons.ChevronRight width={12} height={12} />
                    </Link>
                  )}
                </h2>
              )}
              <div className="rsd-card" style={{ padding: 0, gap: 0, overflow: "hidden" }}>
                {g.players.map((p, i) => (
                  <PlayerRow
                    key={p.id}
                    player={p}
                    isStaff={isStaff}
                    border={i < g.players.length - 1}
                    requirements={requirements}
                    rows={rows}
                    onOpenRequirement={(requirement) => setOpen({ player: p, requirement })}
                  />
                ))}
              </div>
            </section>
          ))
      )}

      {open && (
        <RequirementDialog
          player={open.player}
          requirement={open.requirement}
          row={rows.get(rowKey(open.player.id, open.requirement.id)) ?? null}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

function TeamChip({
  label,
  color,
  count,
  active,
  onClick,
}: {
  label: string;
  color?: string | null;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        height: 34,
        padding: "0 14px",
        borderRadius: 100,
        background: active ? "var(--rsd-accent-fill)" : "var(--gw-bg-elev)",
        color: active ? "var(--rsd-accent-fill-on)" : "var(--gw-fg-muted)",
        border: "1px solid",
        borderColor: active ? "var(--rsd-accent-fill)" : "var(--gw-border)",
        fontSize: 12,
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      {color !== undefined && <TeamDot color={color} />}
      {label}
      {count !== undefined && <span style={{ fontWeight: 600, opacity: 0.65 }}>{count}</span>}
    </button>
  );
}

function SegButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        height: 32,
        padding: "0 14px",
        borderRadius: 8,
        border: "none",
        background: active ? "var(--gw-bg-elev)" : "transparent",
        boxShadow: active ? "0 1px 2px rgba(0,0,0,.08)" : "none",
        color: active ? "var(--gw-fg)" : "var(--gw-fg-muted)",
        fontSize: 12,
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
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
  requirements,
  rows,
  onOpenRequirement,
}: {
  player: DirectoryPlayer;
  isStaff: boolean;
  border: boolean;
  requirements: Requirement[];
  rows: Map<string, PlayerRequirement>;
  onOpenRequirement: (r: Requirement) => void;
}) {
  const age = ageFromDob(p.dob);
  const born = formatDate(p.dob);
  const addr = address(p);
  const staffFacts = [
    p.registration_fee && `Fee: ${p.registration_fee}`,
    // The form's chosen payment option, not a confirmed payment.
    p.payment_method && `Paying by ${p.payment_method}`,
    p.shirt_size && `Shirt: ${p.shirt_size}`,
  ].filter(Boolean);

  return (
    <div
      id={`player-${p.id}`}
      data-tour="directory-player"
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
          {p.jersey_number != null && <JerseyNumber n={p.jersey_number} />}
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--gw-fg)" }}>{p.full_name}</span>
          {p.team && <span className="rsd-chip rsd-chip-mute">{teamLabel(p.team)}</span>}
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
        {isStaff && requirements.length > 0 && (
          <RequirementChips player={p} requirements={requirements} rows={rows} onOpen={onOpenRequirement} />
        )}
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

// One chip per requirement that applies to the player: done (or paid),
// waived, or still needed. Tapping one opens the check-off.
function RequirementChips({
  player,
  requirements,
  rows,
  onOpen,
}: {
  player: DirectoryPlayer;
  requirements: Requirement[];
  rows: Map<string, PlayerRequirement>;
  onOpen: (r: Requirement) => void;
}) {
  const chips = requirements
    .map((r) => ({ r, state: stateFor(player, r, rows), row: rows.get(rowKey(player.id, r.id)) }))
    .filter((c) => c.state !== "n/a");
  if (chips.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
      {chips.map(({ r, state, row }) => {
        const label = requirementLabel(r);
        const variant = state === "done" ? "rsd-chip-success" : state === "waived" ? "rsd-chip-mute" : "rsd-chip-error";
        const text =
          state === "done" ? label : state === "waived" ? `${label} waived` : r.kind === "fee" ? `Owes ${label}` : `Needs ${label}`;
        const title =
          state === "missing"
            ? `Mark ${r.name} for ${player.full_name}`
            : `${state === "done" ? doneWord(r.kind) : "Waived"}${row?.note ? ` · ${row.note}` : ""}${row?.file_path ? " · Scan attached" : ""}`;
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => onOpen(r)}
            data-tour="requirement-chip"
            className={`rsd-chip ${variant}`}
            title={title}
            style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}
          >
            {state === "done" && <Icons.CheckCircle width={11} height={11} />}
            {text}
            {row?.file_path && <Icons.FileText width={11} height={11} />}
          </button>
        );
      })}
    </div>
  );
}

function ParentBlock({ parent, isStaff }: { parent: DirectoryParent; isStaff: boolean }) {
  const m = parent.member!;
  const name = m.full_name ?? m.email ?? "Unknown";
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
        {/* A member's page is for approved members; staff can open anyone's. */}
        {m.status === "approved" || isStaff ? (
          <Link
            href={`/portal/directory/${m.id}`}
            prefetch={false}
            data-tour="directory-parent"
            style={{ fontSize: 13, fontWeight: 700, color: "var(--gw-fg)", textDecoration: "none" }}
          >
            {name}
          </Link>
        ) : (
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--gw-fg)" }}>{name}</span>
        )}
        {isStaff && !m.user_id && m.email && (
          <span className="rsd-chip rsd-chip-mute">Not signed up</span>
        )}
        {isStaff && m.user_id && m.status === "pending" && (
          <Link href="/portal/settings" prefetch={false} style={{ textDecoration: "none" }}>
            <span className="rsd-chip rsd-chip-warn">Awaiting approval</span>
          </Link>
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
