import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPlanningTasks, sortTasks } from "../../../../lib/planning/data";
import { seasonLabel } from "../../../../lib/planning/season";
import type { PlanningRole, ReviewStatus } from "../../../../lib/planning/types";
import { LinkSelect } from "./LinkSelect";
import { FilterRow, planningHref, RoleFilter } from "./nav";
import { ReviewList, type ReviewShow } from "./ReviewList";
import { SeasonSender } from "./SeasonSender";

const SHOW: { key: ReviewShow; label: string; status: ReviewStatus }[] = [
  { key: "pending", label: "Needs review", status: "pending_review" },
  { key: "kept", label: "Kept", status: "approved" },
  { key: "tossed", label: "Tossed", status: "declined" },
];

export function parseShow(s: string | undefined): ReviewShow {
  return s === "kept" || s === "tossed" ? s : "pending";
}

// Each season starts as a copy of the template. The board keeps what it'll
// do this season and tosses the rest.
export async function ReviewView({
  supabase,
  season: seasonParam,
  show,
  role,
  roles,
  currentSeason,
  builtSeasons,
}: {
  supabase: SupabaseClient;
  season: number | null;
  show: ReviewShow;
  role: string | null;
  roles: PlanningRole[];
  currentSeason: number;
  builtSeasons: Set<number>;
}) {
  const { tasks: all } = await loadPlanningTasks(supabase, ["pending_review", "approved", "declined"]);
  const roleOrder = new Map(roles.map((r, i) => [r.id, i]));

  // Default to the earliest season with something waiting, else this season.
  const waitingSeasons = [...new Set(all.filter((t) => t.reviewStatus === "pending_review").map((t) => t.season))].sort();
  const season = seasonParam ?? waitingSeasons[0] ?? currentSeason;
  const inSeason = all.filter((t) => t.season === season && (!role || t.role?.id === role));
  const statusFor = SHOW.find((s) => s.key === show)!.status;
  const shown = sortTasks(inSeason.filter((t) => t.reviewStatus === statusFor), roleOrder);
  const count = (st: ReviewStatus) => inSeason.filter((t) => t.reviewStatus === st).length;

  const seasons = [...new Set([...builtSeasons, currentSeason])].sort();
  const senderSeasons = [currentSeason - 1, currentSeason, currentSeason + 1];
  const nextToBuild = senderSeasons.find((s) => s >= currentSeason && !builtSeasons.has(s)) ?? currentSeason + 1;

  return (
    <>
      <p style={{ margin: 0, fontSize: 14, color: "var(--gw-fg-muted)", lineHeight: 1.6, maxWidth: 680 }}>
        Each season starts as a copy of the template. Keep what the board will do this season and toss what it
        won&apos;t. Kept tasks show on the Calendar and the Year view, and in Opportunities, assigned to whoever holds the
        role.
      </p>

      <FilterRow>
        {seasons.length > 1 && (
          <LinkSelect
            label="Season"
            value={String(season)}
            active={false}
            options={seasons.map((s) => ({
              value: String(s),
              label: `${seasonLabel(s)} season`,
              href: planningHref({ view: "review", season: s, role, show: show === "pending" ? null : show }),
            }))}
          />
        )}
        <RoleFilter
          roles={roles}
          active={role}
          hrefFor={(r) => planningHref({ view: "review", season, role: r, show: show === "pending" ? null : show })}
        />
      </FilterRow>

      <div data-tour="planning-review-show" style={{ display: "flex", gap: 2, flexWrap: "wrap", borderBottom: "1px solid var(--gw-border)" }}>
        {SHOW.map((s) => {
          const on = s.key === show;
          return (
            <Link
              key={s.key}
              href={planningHref({ view: "review", season, role, show: s.key === "pending" ? null : s.key })}
              style={{
                padding: "8px 14px",
                fontSize: 14,
                fontWeight: 700,
                textDecoration: "none",
                color: on ? "var(--gw-fg)" : "var(--gw-fg-muted)",
                borderBottom: `2px solid ${on ? "var(--rsd-accent)" : "transparent"}`,
                marginBottom: -1,
              }}
            >
              {s.label} <span style={{ fontWeight: 600, color: "var(--gw-fg-muted)" }}>{count(s.status)}</span>
            </Link>
          );
        })}
      </div>

      {shown.length > 0 ? (
        <ReviewList key={`${season}-${show}-${role ?? ""}`} tasks={shown} show={show} />
      ) : (
        <div className="rsd-card" style={{ padding: "40px 24px", textAlign: "center", gap: 6 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>
            {show === "pending"
              ? builtSeasons.has(season)
                ? `Nothing left to review for ${seasonLabel(season)}`
                : `${seasonLabel(season)} hasn't been sent to Review yet`
              : show === "kept"
                ? "Nothing kept yet"
                : "Nothing tossed"}
          </div>
          {show === "pending" && builtSeasons.has(season) && (
            <div style={{ fontSize: 13, color: "var(--gw-fg-muted)" }}>
              Everything&apos;s been kept or tossed. Kept tasks are on the calendar.
            </div>
          )}
        </div>
      )}

      <div data-tour="planning-season-sender" className="rsd-card" style={{ gap: 12, padding: "16px 20px" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Start a season from the template</div>
          <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", lineHeight: 1.6, marginTop: 4, maxWidth: 640 }}>
            Copies every monthly task in the Template tab into the season, waiting here for review. Pressing it
            again for a season only adds template items it doesn&apos;t have yet, and never brings back what you
            tossed.
          </div>
        </div>
        <SeasonSender
          seasons={senderSeasons}
          initial={senderSeasons.includes(season) ? season : nextToBuild}
          built={[...builtSeasons]}
        />
      </div>
    </>
  );
}
