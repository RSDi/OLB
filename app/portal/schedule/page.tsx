import Link from "next/link";
import { redirect } from "next/navigation";
import { getViewer } from "../../../lib/auth/viewer";
import { createClient } from "../../../lib/supabase/server";
import { churchToday } from "../../../lib/dates/today";
import { seasonOf } from "../../../lib/planning/season";
import { viewerHsScheduleAccess } from "../../../lib/hs-schedule/viewer";
import {
  loadHsContactOptions,
  loadHsSeasonSchedule,
  loadHsSeasons,
  loadHsTravelPlaces,
  loadKnownTeams,
} from "../../../lib/hs-schedule/data";
import { ScheduleView, type CompareWeekend } from "./_components/ScheduleView";
import { EmptySchedule } from "./_components/EmptySchedule";
import type { DirectoryTeam } from "./_components/SeasonSheet";

// The HS Schedule (/portal/schedule): the high school season weekend by
// weekend, for the coaches and the board, and for the travel coordinator to
// look at without changing (0111). ?season=2026 picks the season
// (2026 = 2026–27; the current one by default), ?compare=2025 puts another
// season's same weekends beside it.
export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string; compare?: string }>;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  const access = await viewerHsScheduleAccess(viewer);
  if (!access) return <NotAvailable />;
  const canEdit = access === "edit";

  const params = await searchParams;
  const supabase = await createClient();
  const { ok, seasons } = await loadHsSeasons(supabase);
  if (!ok) return <MigrationNotice />;

  const today = churchToday();
  const current = seasonOf(today);
  const wanted = parseSeason(params.season);
  const season =
    seasons.find((s) => s.season === wanted) ??
    seasons.find((s) => s.season === current) ??
    // Nothing for this season yet: the latest one before it, else the next.
    seasons.find((s) => s.season < current) ??
    seasons[seasons.length - 1] ??
    null;
  if (!season) return <EmptySchedule isStaff={viewer.isStaff} current={current} />;

  const compareSeason = seasons.find((s) => s.season === parseSeason(params.compare) && s.id !== season.id) ?? null;
  const board = `${season.season}-${season.season + 1}`;
  const [schedule, options, knownTeams, compareRows, teams, travelPlaces] = await Promise.all([
    loadHsSeasonSchedule(supabase, season),
    // The programs to add teams from: all of them for the board, the types
    // shared with coaches for a coach (RLS, 0109). Only for those who edit.
    canEdit ? loadHsContactOptions(supabase) : Promise.resolve([]),
    canEdit ? loadKnownTeams(supabase) : Promise.resolve([]),
    compareSeason
      ? supabase
          .from("hs_weekends")
          .select("id, starts_on, ends_on, event, status")
          .eq("season_id", compareSeason.id)
          .order("starts_on")
          .then(({ data }) => (data as CompareWeekend[] | null) ?? [])
      : Promise.resolve(null),
    // The season's teams in the Directory, to link the columns to (Season
    // settings, for those who edit).
    !canEdit
      ? Promise.resolve([] as DirectoryTeam[])
      : supabase
          .from("olb_boards")
          .select("id")
          .eq("season", board)
          .maybeSingle()
          .then(async ({ data }) => {
            if (!data) return [] as DirectoryTeam[];
            const { data: t } = await supabase
              .from("olb_teams")
              .select("id, name, age_group")
              .eq("board_id", (data as { id: string }).id)
              .order("sort_order")
              .order("name");
            return (t as DirectoryTeam[] | null) ?? [];
          }),
    // Hotels and places to eat, for where to stay and eat on weekends away.
    loadHsTravelPlaces(supabase),
  ]);

  return (
    <ScheduleView
      // A fresh load (another season, an import) starts the page's copy over.
      key={`${season.id}:${compareSeason?.id ?? ""}`}
      schedule={schedule}
      seasons={seasons}
      compare={compareSeason && compareRows ? { season: compareSeason.season, weekends: compareRows } : null}
      isStaff={viewer.isStaff}
      canEdit={canEdit}
      options={options}
      knownTeams={knownTeams}
      directoryTeams={teams}
      travelPlaces={travelPlaces}
      today={today}
    />
  );
}

function parseSeason(s: string | undefined): number | null {
  if (!s || !/^\d{4}$/.test(s)) return null;
  const n = Number(s);
  return n >= 2000 && n <= 2100 ? n : null;
}

function NotAvailable() {
  return (
    <div className="rsd-card" style={{ padding: "32px 24px", gap: 8, textAlign: "center" }}>
      <div style={{ fontSize: 16, fontWeight: 700 }}>The HS Schedule is for coaches, the board and the travel coordinator</div>
      <div style={{ fontSize: 13, color: "var(--gw-fg-muted)" }}>
        If you coach a team and can&apos;t see it, ask the board to add you as the team&apos;s coach in the Directory.
      </div>
      <div style={{ marginTop: 8 }}>
        <Link href="/portal" style={{ fontSize: 13, fontWeight: 700 }}>
          Back to the portal
        </Link>
      </div>
    </div>
  );
}

function MigrationNotice() {
  return (
    <div
      className="rsd-card"
      style={{ padding: "16px 20px", gap: 6, borderColor: "var(--rsd-warn-line)", background: "var(--rsd-warn-bg)" }}
    >
      <div style={{ fontSize: 14, fontWeight: 700 }}>The HS Schedule isn&apos;t set up in the database yet</div>
      <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", lineHeight: 1.6 }}>
        Apply <code>supabase/migrations/0107_contact_program_fields.sql</code> and{" "}
        <code>0108_hs_schedule.sql</code> in the Supabase SQL editor (they run by themselves when merged to main).
        Then import the planning spreadsheet from here or from External Contacts.
      </div>
    </div>
  );
}

