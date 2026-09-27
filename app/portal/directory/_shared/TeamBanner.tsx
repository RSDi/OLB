// A team's banner in the Directory: its color, practice details and the
// volunteer roles marked "In Directory" (Settings → Volunteer Roles).

import Link from "next/link";
import { Icons } from "../../../components/icons";
import type { OlbVolunteerRole } from "../../../../lib/teams/types";
import type { TeamWithStaff } from "../../../../lib/teams/volunteer-data";
import { initials, roleSpots, teamColorHex, teamLabel } from "../../../../lib/teams/volunteer-options";

export function TeamBanner({
  team,
  roles,
  playerCount,
}: {
  team: TeamWithStaff;
  roles: OlbVolunteerRole[];
  playerCount: number;
}) {
  const spots = roleSpots(roles.filter((r) => r.show_in_directory), team.volunteers);
  return (
    <div className="rsd-card" style={{ padding: 0, gap: 0, overflow: "hidden" }}>
      <div style={{ height: 6, background: teamColorHex(team.color) }} />
      <div
        style={{
          padding: "16px 20px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span
              style={{
                fontFamily: "var(--rsd-display)",
                fontSize: 30,
                fontWeight: 800,
                lineHeight: 1,
                textTransform: "uppercase",
                color: "var(--gw-fg)",
              }}
            >
              {teamLabel(team)}
            </span>
            {team.division && <span className="rsd-chip rsd-chip-mute">{team.division}</span>}
          </div>
          <TeamFacts team={team} playerCount={playerCount} />
        </div>
        <Link
          href={`/portal/directory/teams/${team.id}`}
          prefetch={false}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "10px 16px",
            borderRadius: 100,
            background: "var(--gw-fg)",
            color: "var(--rsd-accent-fill)",
            fontSize: 13,
            fontWeight: 700,
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          Team page
          <Icons.ChevronRight width={14} height={14} />
        </Link>
      </div>
      {spots.length > 0 && (
        <div
          style={{
            borderTop: "1px solid var(--gw-border)",
            padding: "12px 20px",
            display: "flex",
            gap: "12px 28px",
            flexWrap: "wrap",
            background: "var(--gw-bg)",
          }}
        >
          {spots.map((s, i) => (
            <div key={s.volunteer?.id ?? `${s.role.id}-open-${i}`} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {s.volunteer ? (
                <Avatar name={s.volunteer.member.full_name} dark />
              ) : (
                <span
                  aria-hidden="true"
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    border: "1.5px dashed var(--gw-fg-faint)",
                    color: "var(--gw-fg-muted)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icons.Plus width={13} height={13} />
                </span>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={capStyle}>{s.role.name}</span>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: s.volunteer ? "var(--gw-fg)" : "var(--gw-fg-muted)",
                  }}
                >
                  {s.volunteer ? s.volunteer.member.full_name ?? s.volunteer.member.email : "Open spot"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function TeamFacts({
  team,
  playerCount,
  color = "var(--gw-fg-muted)",
}: {
  team: TeamWithStaff;
  playerCount: number;
  color?: string;
}) {
  return (
    <div style={{ display: "flex", gap: "4px 16px", flexWrap: "wrap", fontSize: 13, fontWeight: 600, color }}>
      {team.practice_times.length > 0 && (
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <Icons.Clock width={13} height={13} />
          {team.practice_times.join(" · ")}
        </span>
      )}
      {team.practice_location && (
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <Icons.MapPin width={13} height={13} />
          {team.practice_location}
        </span>
      )}
      <span>
        {playerCount} {playerCount === 1 ? "player" : "players"}
      </span>
    </div>
  );
}

export function Avatar({ name, dark, size = 32 }: { name: string | null; dark?: boolean; size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: "50%",
        background: dark ? "var(--gw-fg)" : "var(--gw-bg)",
        color: dark ? "var(--rsd-accent-fill)" : "var(--gw-fg)",
        border: dark ? "none" : "1px solid var(--gw-border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: Math.round(size * 0.36),
        fontWeight: 800,
      }}
    >
      {initials(name)}
    </span>
  );
}

export function TeamDot({ color, size = 10 }: { color: string | null; size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: "50%",
        background: teamColorHex(color),
        boxShadow: "inset 0 0 0 1px rgba(0,0,0,.2)",
      }}
    />
  );
}

export const capStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: ".1em",
  textTransform: "uppercase",
  color: "var(--gw-fg-muted)",
};
