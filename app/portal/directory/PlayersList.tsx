"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Icons } from "../../components/icons";
import { MapLink } from "../../components/MapLink";
import { ClearSearchButton } from "../../components/ui";
import { ageFromDob } from "../../../lib/teams/age";
import type { DirectoryPlayer } from "./_shared/data";
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
import { ContactLine, ParentBlock, RequirementChips, TeamPicker, formatDate, muted, playerAddress } from "./_shared/PlayerParts";
import { ComboSelect } from "../../components/ComboSelect";
import { Pill } from "../../components/ui";
import { ComposeSheet } from "./_shared/Messaging";
import { SlackComposeSheet } from "./_shared/SlackMessaging";
import { SlackLogo } from "../../components/SlackLogo";
import { FAMILY_MESSAGE, playerOwnEmail, playerTarget } from "../../../lib/teams/family-mail";
import { sendPlayerMessage } from "../../../lib/teams/player-message-actions";

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

type View = "team" | "age";
const NO_TEAM = "none";
// The team, age group and requirement drop-downs share one look.
const filterSelect = { height: 34, padding: "0 12px", borderRadius: 100, fontSize: 12, fontWeight: 700, cursor: "pointer" } as const;
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
  canPlace,
  canEmail,
  canSlack,
  registrations,
}: {
  players: DirectoryPlayer[];
  isStaff: boolean;
  teams: TeamWithStaff[];
  roles: OlbVolunteerRole[];
  canViewAges: boolean;
  // Staff only (0098); empty for everyone else.
  requirements: Requirement[];
  requirementRows: PlayerRequirement[];
  // The Registrations grant (0102): a team picker on every player, and the
  // new-registrations banner.
  canPlace: boolean;
  // The board and the Registrations grant: Email families, to the players
  // in view.
  canEmail: boolean;
  // The Slack DMs grant (0118): Slack families, to the players in view.
  canSlack: boolean;
  // Waiting and waitlisted registrations; null without the grant.
  registrations: { waiting: number; waitlist: number } | null;
}) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("team");
  const [teamId, setTeamId] = useState("all");
  const [group, setGroup] = useState("all");
  const [reqId, setReqId] = useState("all");
  const [reqShow, setReqShow] = useState<ReqShow>("missing");
  const [open, setOpen] = useState<{ player: DirectoryPlayer; requirement: Requirement } | null>(null);
  const [emailing, setEmailing] = useState(false);
  const [slacking, setSlacking] = useState(false);

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

  const showTeamFilter = view === "team" && teams.length > 0;
  const showGroupFilter = view === "age" && groupNames.length > 1;
  const pickedTeam = view === "team" && teamId !== "all" ? teams.find((t) => t.id === teamId) ?? null : null;
  const shown = shownSections.reduce((n, g) => n + g.players.length, 0);
  const reqTotal = reqCounts.done + reqCounts.waived + reqCounts.missing;
  const season = players[0]?.board?.season;
  // Who Email families and Slack families write to: the players in view, as
  // the filters say.
  const inView = shownSections.flatMap((g) => g.players);
  const scope = [
    view === "team" ? (pickedTeam ? teamLabel(pickedTeam) : teamId === NO_TEAM ? "No team yet" : null) : group !== "all" ? group : null,
    pickedReq && reqShow !== "all" && `${reqShow === "missing" ? "Missing" : reqShow === "done" ? doneWord(pickedReq.kind) : "Waived"}: ${pickedReq.name}`,
    query.trim() && `Search "${query.trim()}"`,
  ].filter(Boolean);

  return (
    <>
      {registrations && registrations.waiting > 0 && <RegistrationsBanner count={registrations.waiting} />}

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
            {registrations && <RegistrationsLink counts={registrations} />}
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
      </div>

      {(showTeamFilter || showGroupFilter || requirements.length > 0) && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {showTeamFilter && (
            <ComboSelect
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              aria-label="Show a team"
              data-tour="directory-teams"
              className="rsd-chip"
              style={filterSelect}
            >
              <option value="all">All teams</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {teamLabel(t)} ({countByTeam.get(t.id) ?? 0})
                </option>
              ))}
              {(countByTeam.get(NO_TEAM) ?? 0) > 0 && (
                <option value={NO_TEAM}>No team yet ({countByTeam.get(NO_TEAM)})</option>
              )}
            </ComboSelect>
          )}
          {showGroupFilter && (
            <ComboSelect
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              aria-label="Show an age group"
              className="rsd-chip"
              style={filterSelect}
            >
              <option value="all">All ages</option>
              {groupNames.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </ComboSelect>
          )}
          {requirements.length > 0 && (
            <div data-tour="directory-requirements" style={{ display: "inline-flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <ComboSelect
                value={reqId}
                onChange={(e) => {
                  setReqId(e.target.value);
                  setReqShow("missing");
                }}
                aria-label="Filter by requirement"
                data-tour="requirement-filter"
                className="rsd-chip"
                style={filterSelect}
              >
                <option value="all">All requirements</option>
                {requirements.map((r) => (
                  <option key={r.id} value={r.id}>
                    {requirementLabel(r)}
                  </option>
                ))}
              </ComboSelect>
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
        </div>
      )}

      {pickedTeam && (
        <TeamBanner team={pickedTeam} roles={roles} playerCount={countByTeam.get(pickedTeam.id) ?? 0} />
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div data-tour="requirement-summary" style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 600 }}>
          {shown} {shown === 1 ? "player" : "players"}
          {season && ` · ${season} season`}
          {pickedReq &&
            ` · ${pickedReq.name}: ${reqCounts.done + reqCounts.waived} of ${reqTotal} ${pickedReq.kind === "fee" ? "paid" : "done"}` +
              (reqCounts.waived > 0 ? ` (${reqCounts.waived} waived)` : "")}
        </div>
        {(canEmail || canSlack) && shown > 0 && (
          <span style={{ display: "inline-flex", gap: 8, flexWrap: "wrap" }}>
            {canEmail && (
              <span data-tour="directory-email" style={{ display: "inline-flex" }}>
                <Pill size="sm" variant="light" onClick={() => setEmailing(true)}>
                  <Icons.Mail width={13} height={13} /> {shown === 1 ? "Email family" : "Email families"}
                </Pill>
              </span>
            )}
            {canSlack && (
              <span data-tour="directory-slack" style={{ display: "inline-flex" }}>
                <Pill size="sm" variant="light" onClick={() => setSlacking(true)}>
                  <SlackLogo size={13} /> {shown === 1 ? "Slack family" : "Slack families"}
                </Pill>
              </span>
            )}
          </span>
        )}
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
                  : teamId === NO_TEAM
                    ? "Everyone is on a team."
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
                    teams={canPlace ? teams : null}
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

      {emailing && (
        <ComposeSheet
          targets={inView.map(playerTarget)}
          title={inView.length === 1 ? "Email the family" : "Email families"}
          eyebrow={[`${inView.length} ${inView.length === 1 ? "player" : "players"}`, ...scope].join(" · ")}
          note="Sent from the club's email address, one email per family (brothers and sisters get one between them). Replies go to the club's Gmail. A copy is kept on each player's page."
          subject=""
          body={FAMILY_MESSAGE}
          onSend={sendPlayerMessage}
          onClose={() => setEmailing(false)}
        />
      )}

      {slacking && (
        <SlackComposeSheet
          targets={inView.map(playerTarget)}
          eyebrow={[`${inView.length} ${inView.length === 1 ? "player" : "players"}`, ...scope].join(" · ")}
          onClose={() => setSlacking(false)}
        />
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

// New registrations from the public form, for whoever reviews them.
function RegistrationsBanner({ count }: { count: number }) {
  return (
    <div
      className="rsd-card"
      data-tour="directory-registrations"
      style={{
        flexDirection: "row",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 14,
        padding: "14px 18px",
        background: "var(--rsd-accent-bg)",
        borderColor: "var(--rsd-accent-line)",
      }}
    >
      <span
        style={{
          width: 38,
          height: 38,
          borderRadius: 11,
          background: "var(--rsd-accent-fill)",
          color: "var(--rsd-accent-fill-on)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 18,
          fontWeight: 800,
          flexShrink: 0,
        }}
      >
        {count}
      </span>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: "1 1 240px", minWidth: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: "var(--gw-fg)" }}>
          {count === 1 ? "1 new registration to review" : `${count} new registrations to review`}
        </span>
        <span style={{ ...muted, fontSize: 12.5 }}>
          Approving one puts the player under No team yet and their fee on the Payments page.
        </span>
      </div>
      <Link
        href="/portal/directory/registrations"
        prefetch={false}
        className="gw-press"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          height: 38,
          padding: "0 16px",
          borderRadius: 100,
          background: "var(--gw-ink)",
          color: "#fff",
          fontSize: 13,
          fontWeight: 700,
          textDecoration: "none",
          whiteSpace: "nowrap",
        }}
      >
        Review registrations
        <Icons.ChevronRight width={13} height={13} />
      </Link>
    </div>
  );
}

// Always there for the Registrations grant, so the Waitlist and Approved
// tabs are a tap away even when nothing is waiting.
function RegistrationsLink({ counts }: { counts: { waiting: number; waitlist: number } }) {
  const detail = [counts.waiting > 0 && `${counts.waiting} waiting`, counts.waitlist > 0 && `${counts.waitlist} on waitlist`]
    .filter(Boolean)
    .join(" · ");
  return (
    <Link
      href={counts.waiting === 0 && counts.waitlist > 0 ? "/portal/directory/registrations?tab=waitlist" : "/portal/directory/registrations"}
      prefetch={false}
      data-tour="directory-registrations-link"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        height: 38,
        padding: "0 14px",
        borderRadius: 10,
        border: "1px solid var(--gw-border)",
        background: "var(--gw-bg-elev)",
        color: "var(--gw-fg)",
        fontSize: 12,
        fontWeight: 700,
        textDecoration: "none",
        whiteSpace: "nowrap",
      }}
    >
      Registrations
      {detail && <span style={{ fontWeight: 600, color: "var(--gw-fg-muted)" }}>{detail}</span>}
      <Icons.ChevronRight width={12} height={12} />
    </Link>
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

function PlayerRow({
  player: p,
  isStaff,
  teams,
  border,
  requirements,
  rows,
  onOpenRequirement,
}: {
  player: DirectoryPlayer;
  isStaff: boolean;
  // Set for the Registrations grant: the team picker.
  teams: TeamWithStaff[] | null;
  border: boolean;
  requirements: Requirement[];
  rows: Map<string, PlayerRequirement>;
  onOpenRequirement: (r: Requirement) => void;
}) {
  const age = ageFromDob(p.dob);
  const born = formatDate(p.dob);
  const addr = playerAddress(p);
  const ownEmail = playerOwnEmail(p);
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
          <Link
            href={`/portal/directory/players/${p.id}`}
            prefetch={false}
            data-tour="directory-player-link"
            style={{ fontSize: 15, fontWeight: 700, color: "var(--gw-fg)", textDecoration: "none" }}
          >
            {p.full_name}
          </Link>
          {p.team && <span className="rsd-chip rsd-chip-mute">{teamLabel(p.team)}</span>}
          {p.new_to_program && <span className="rsd-chip rsd-chip-accent">New</span>}
          {isStaff && !p.waiver_signed && <span className="rsd-chip rsd-chip-error">No waiver</span>}
          {/* Only people who can see an opted-out player get it at all: the
              board, the Treasurer, and the player's own parents (0101). */}
          {!p.directory_optin && (
            <span
              className="rsd-chip rsd-chip-mute"
              title={isStaff ? "The family said no to the directory; only staff see this player" : "The family said no to the directory; other families don't see this player"}
            >
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
          <MapLink
            address={addr}
            icon={<Icons.MapPin width={12} height={12} style={{ flexShrink: 0, marginTop: 2, color: "var(--gw-fg-muted)" }} />}
            style={{ ...muted, color: "var(--gw-fg)", display: "flex", gap: 6, alignItems: "flex-start", alignSelf: "flex-start" }}
          />
        )}
        {(p.phone || ownEmail) && (
          <ContactLine phone={p.phone} email={ownEmail} label="Player" />
        )}
        {isStaff && staffFacts.length > 0 && <div style={muted}>{staffFacts.join(" · ")}</div>}
        {requirements.length > 0 && (
          <RequirementChips player={p} requirements={requirements} rows={rows} onOpen={onOpenRequirement} />
        )}
        {teams && <TeamPicker player={p} teams={teams} />}
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
