// The portal search assistant's lookups: the tools the AI chooses between to
// answer a question, and what it's told about the member asking.
//
// Every tool runs as the signed-in member (the server client carries their
// session), so row-level security decides what each lookup can return, as in
// the top-bar search. The assistant can never read a record the member
// couldn't open themselves. Each record a tool returns is numbered in the
// turn's SourceRegistry, which is what the answer's [n] citations point at.

import { tool, type ToolSet } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Viewer } from "../auth/viewer";
import { churchToday, CHURCH_TZ } from "../dates/today";
import { zonedTimeToUtc } from "../dates/zoned";
import { expandEventOccurrences } from "../events/occurrences";
import {
  cut,
  mergeHits,
  oneLine,
  searchTerms,
  TYPE_LABEL,
  type RecordText,
  type SourceRegistry,
  type TermHits,
} from "./query";
import { loadRecordTexts, runSearches } from "./records";

const WEEKDAY_DATE = new Intl.DateTimeFormat("en-US", {
  weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: CHURCH_TZ,
});
const WHEN = new Intl.DateTimeFormat("en-US", {
  weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: CHURCH_TZ,
});
const DAY = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
// Plain dates ("2026-10-06") read at noon UTC, so no timezone moves them.
const day = (ymd: string) => DAY.format(new Date(`${ymd}T12:00:00Z`));

// Free text headed for a PostgREST filter string: no characters that change
// the filter's meaning.
function filterSafe(s: string): string {
  return s.replace(/[,()"'%*\\:.]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

type Row = Record<string, unknown>;

// What the assistant is told about the person asking: who they are, their
// role, their children and those children's teams, and today's date. It's
// what lets "my son's practice" or "our next game" work.
export async function loadMemberContext(supabase: SupabaseClient, viewer: Viewer): Promise<string> {
  const [me, kids] = await Promise.all([
    supabase.from("members").select("full_name, nickname").eq("id", viewer.memberId).maybeSingle(),
    supabase
      .from("olb_player_parents")
      .select("relationship, player:olb_players(full_name, grade, team:olb_teams(name, age_group, division, practice_times))")
      .eq("member_id", viewer.memberId),
  ]);
  const name = (me.data?.full_name as string | undefined) ?? "a member";
  const role = viewer.isSuperAdmin ? "super-admin" : viewer.isStaff ? "board member" : "member";
  const lines = [`Today is ${WEEKDAY_DATE.format(new Date())} (${churchToday()}, Central Time).`, `Asking: ${name}, a ${role}.`];
  const children = ((kids.data ?? []) as unknown as Array<{ relationship: string; player: Row | null }>)
    .map((k) => k.player)
    .filter((p): p is Row => !!p);
  for (const p of children) {
    const team = p.team as Row | null;
    const teamText = team
      ? `${team.name}${team.age_group ? ` (${team.age_group})` : ""}${team.division ? `, ${team.division}` : ""}` +
        ((team.practice_times as string[] | null)?.length ? `; practices ${(team.practice_times as string[]).join("; ")}` : "")
      : "not on a team yet";
    lines.push(`Their child: ${p.full_name}${p.grade ? `, grade ${p.grade}` : ""}, ${teamText}.`);
  }
  if (!children.length) lines.push("No children are linked to their account.");
  return lines.join("\n");
}

const SEARCH_TYPES = ["member", "contact", "maintenance", "pm_task", "pm_template", "asset", "event", "playbook", "slack"] as const;

export function makeTools({
  supabase,
  viewer,
  registry,
  onSearch,
}: {
  supabase: SupabaseClient;
  viewer: Viewer;
  registry: SourceRegistry;
  // Each search's raw hits, for the page's list of matching records.
  onSearch: (lists: TermHits[]) => void;
}): ToolSet {
  return {
    search_portal: tool({
      description:
        "Search the portal's records: members, external contacts (board only), tasks, events, playbooks, preventive maintenance items, assets and Slack messages. Use a few specific keywords, not a whole sentence. Search again with other words, or narrower types, when the first results don't answer the question. Returns numbered sources with their text.",
      inputSchema: z.object({
        query: z.string().min(2).max(120).describe("A few keywords, e.g. 'uniform order' or 'gym key'"),
        types: z.array(z.enum(SEARCH_TYPES)).optional().describe("Only these kinds of record"),
      }),
      execute: async ({ query, types }) => {
        const texts: RecordText = new Map();
        const lists = await runSearches(supabase, query, searchTerms(query), texts);
        onSearch(lists);
        const hits = mergeHits(lists, 40).filter((h) => !types?.length || (types as string[]).includes(h.entity_type));
        const top = hits.slice(0, 8);
        if (!top.length) return { found: 0, tip: "Nothing matched. Try other or fewer words." };
        await loadRecordTexts(supabase, top, texts);
        return top.map((h) => {
          const text = texts.get(`${h.entity_type}:${h.id}`) ?? [h.title, h.subtitle].filter(Boolean).join("\n");
          const source = registry.add({ entity_type: h.entity_type, id: h.id, title: h.title, href: h.href, text });
          return { source, type: TYPE_LABEL[h.entity_type], title: oneLine(h.title), text: cut(text, 1200) };
        });
      },
    }),

    get_record: tool({
      description: "Read the full text of a source already found, by its number, when the shortened text isn't enough.",
      inputSchema: z.object({ source: z.number().int().min(1) }),
      execute: async ({ source }) => {
        const s = registry.get(source);
        return s ? { source, type: TYPE_LABEL[s.entity_type], title: s.title, text: s.text } : { error: `No source ${source}.` };
      },
    }),

    schedule: tool({
      description:
        "What's on the calendar between two dates: club events (recurring ones included), and the high school schedule's weekends for those allowed to see it. Use it for 'when', 'this weekend', 'next game' and similar questions.",
      inputSchema: z.object({
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("First day, YYYY-MM-DD"),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Last day, YYYY-MM-DD (at most 92 days after from)"),
        team: z.string().max(40).optional().describe("Only entries that mention this team, e.g. '12U'"),
      }),
      execute: async ({ from, to, team }) => {
        if (to < from) [from, to] = [to, from];
        const fromD = zonedTimeToUtc(from, { hour: 0, minute: 0 });
        let toD = zonedTimeToUtc(to, { hour: 23, minute: 59 });
        const maxTo = new Date(fromD.getTime() + 92 * 86_400_000);
        if (toD > maxTo) toD = maxTo;

        const [events, weekends] = await Promise.all([
          supabase
            .from("events")
            .select("id, title, description, location, start_at, end_at, recurring, recur_freq, recur_weekdays, recur_monthly_week, recur_monthly_weekday, recur_until, recur_except")
            .is("deleted_at", null)
            .lte("start_at", toD.toISOString())
            .or(`recurring.eq.true,start_at.gte."${fromD.toISOString()}"`)
            .limit(300),
          supabase
            .from("hs_weekends")
            .select("id, starts_on, ends_on, event, details, location, trip, status, games:hs_weekend_games(games, note, level:hs_levels(label, name, hidden))")
            .lte("starts_on", to)
            .gte("ends_on", from)
            .order("starts_on")
            .limit(40),
        ]);
        if (events.error) console.error("[portal-search] schedule events failed", events.error);
        // Readable only by the schedule's planners: anyone else just gets no rows.
        if (weekends.error) console.error("[portal-search] schedule weekends failed", weekends.error);

        const entries: Array<{ at: string; source: number; line: string; text: string }> = [];
        const evRows = (events.data ?? []) as unknown as Array<Row & { id: string; title: string; start_at: string; end_at: string | null }>;
        const byEvent = new Map<string, string[]>();
        for (const occ of expandEventOccurrences(evRows, { from: fromD, to: toD })) {
          const t = new Date(occ.startAt);
          if (t < fromD || t > toD) continue;
          const list = byEvent.get(occ.event.id) ?? [];
          list.push(occ.startAt);
          byEvent.set(occ.event.id, list);
        }
        for (const ev of evRows) {
          const times = byEvent.get(ev.id);
          if (!times) continue;
          const text = [
            `Event: ${ev.title}`,
            ev.location ? `Location: ${ev.location}` : null,
            ev.description ? `Description: ${ev.description}` : null,
            `Dates in range: ${times.map((s) => WHEN.format(new Date(s))).join("; ")}`,
          ].filter(Boolean).join("\n");
          const source = registry.add({ entity_type: "event", id: ev.id, title: ev.title, href: `/portal/events/${ev.id}/edit`, text });
          for (const s of times) {
            entries.push({ at: s, source, line: `${WHEN.format(new Date(s))}: ${ev.title}${ev.location ? ` @ ${ev.location}` : ""}`, text });
          }
        }
        for (const w of (weekends.data ?? []) as unknown as Row[]) {
          const games = ((w.games as Row[] | null) ?? [])
            .filter((g) => g.level && !(g.level as Row).hidden && (g.games || g.note))
            .map((g) => `${(g.level as Row).label}: ${g.games ?? "?"} game(s)${g.note ? ` (${g.note})` : ""}`);
          const title = `${w.event || "HS weekend"} (${day(w.starts_on as string)}–${day(w.ends_on as string)})`;
          const text = [
            `High school schedule: ${title}`,
            `Status: ${w.status}`,
            w.location ? `Location: ${w.location}` : null,
            w.trip ? `Trip: ${w.trip}` : null,
            w.details ? `Details: ${w.details}` : null,
            games.length ? `Games: ${games.join("; ")}` : null,
          ].filter(Boolean).join("\n");
          const source = registry.add({ entity_type: "schedule", id: w.id as string, title, href: "/portal/schedule", text });
          entries.push({ at: `${w.starts_on}T12:00:00Z`, source, line: `${title}: ${w.status}${w.location ? ` @ ${w.location}` : ""}`, text });
        }

        entries.sort((a, b) => a.at.localeCompare(b.at));
        const wanted = team?.trim().toLowerCase();
        const matching = wanted ? entries.filter((e) => e.text.toLowerCase().includes(wanted)) : entries;
        const shown = (matching.length ? matching : entries).slice(0, 60);
        return {
          from,
          to,
          ...(wanted && !matching.length ? { note: `Nothing mentions "${team}", so this is everything in the range.` } : {}),
          entries: shown.map(({ source, line }) => ({ source, line })),
          ...(entries.length > shown.length ? { more: entries.length - shown.length } : {}),
        };
      },
    }),

    team: tool({
      description: "A team from the current season: its practice times, division, players and coaches.",
      inputSchema: z.object({ name: z.string().min(2).max(40).describe("Team name or age group, e.g. '12U Black' or '10U'") }),
      execute: async ({ name }) => {
        const q = filterSafe(name);
        if (!q) return { found: 0 };
        const { data, error } = await supabase
          .from("olb_teams")
          .select("id, name, age_group, grade_label, division, practice_times, board:olb_boards(season), players:olb_players(full_name, grade), coaches:olb_coaches(name, role)")
          .or(`name.ilike.*${q}*,age_group.ilike.*${q}*`)
          .limit(12);
        if (error) {
          console.error("[portal-search] team lookup failed", error);
          return { found: 0 };
        }
        const rows = (data ?? []) as unknown as Row[];
        const season = rows.map((r) => ((r.board as Row | null)?.season as string) ?? "").sort().pop();
        const current = rows.filter((r) => ((r.board as Row | null)?.season ?? "") === season);
        if (!current.length) return { found: 0 };
        return current.map((t) => {
          const players = ((t.players as Row[] | null) ?? []).map((p) => `${p.full_name}${p.grade ? ` (grade ${p.grade})` : ""}`);
          const coaches = ((t.coaches as Row[] | null) ?? []).map((c) => `${c.name}${c.role ? ` (${c.role})` : ""}`);
          const text = [
            `Team: ${t.name}${t.age_group ? ` (${t.age_group})` : ""}, ${season} season`,
            t.division ? `Division: ${t.division}` : null,
            t.grade_label ? `Grade: ${t.grade_label}` : null,
            (t.practice_times as string[] | null)?.length ? `Practices: ${(t.practice_times as string[]).join("; ")}` : null,
            coaches.length ? `Coaches: ${coaches.join(", ")}` : null,
            players.length ? `Players you can see: ${players.join(", ")}` : "No players you can see.",
          ].filter(Boolean).join("\n");
          const source = registry.add({ entity_type: "team", id: t.id as string, title: t.name as string, href: `/portal/directory/teams/${t.id}`, text });
          return { source, text };
        });
      },
    }),

    tasks: tool({
      description: "Open tasks and projects: the member's own, everything open, overdue ones, or ones due in the next two weeks.",
      inputSchema: z.object({ filter: z.enum(["mine", "open", "overdue", "due_soon"]) }),
      execute: async ({ filter }) => {
        const today = churchToday();
        let q = supabase
          .from("maintenance_requests")
          .select("id, description, status, start_on, due_on, assigned_to")
          .is("deleted_at", null)
          .in("status", ["open", "in_progress"]);
        if (filter === "mine") q = q.eq("assigned_to", viewer.memberId);
        if (filter === "overdue") q = q.lt("due_on", today);
        if (filter === "due_soon") {
          const soon = new Date(`${today}T12:00:00Z`);
          soon.setUTCDate(soon.getUTCDate() + 14);
          q = q.gte("due_on", today).lte("due_on", soon.toISOString().slice(0, 10));
        }
        const { data, error } = await q.order("due_on", { ascending: true, nullsFirst: false }).limit(25);
        if (error) {
          console.error("[portal-search] tasks lookup failed", error);
          return { found: 0 };
        }
        const rows = (data ?? []) as unknown as Row[];
        const ownerIds = [...new Set(rows.map((r) => r.assigned_to).filter(Boolean))] as string[];
        const owners = new Map<string, string>();
        if (ownerIds.length) {
          const { data: people } = await supabase.from("members").select("id, full_name").in("id", ownerIds);
          for (const p of (people ?? []) as Row[]) owners.set(p.id as string, p.full_name as string);
        }
        if (!rows.length) return { found: 0 };
        return rows.map((r) => {
          const text = [
            `Task: ${r.description}`,
            `Status: ${r.status}`,
            r.assigned_to ? `Owner: ${owners.get(r.assigned_to as string) ?? "someone"}` : "Owner: nobody yet",
            r.start_on ? `Starts: ${day(r.start_on as string)}` : null,
            r.due_on ? `Due: ${day(r.due_on as string)}` : null,
          ].filter(Boolean).join("\n");
          const source = registry.add({ entity_type: "maintenance", id: r.id as string, title: r.description as string, href: `/portal/tasks/${r.id}`, text });
          return { source, text };
        });
      },
    }),

    // No execute: calling it ends the turn, and the page shows the question
    // with the options as buttons.
    ask_user: tool({
      description:
        "Ask the member one short clarifying question when their question could mean clearly different things (which team, which event) and looking it up can't settle it. Offer 2-5 short answers to tap.",
      inputSchema: z.object({
        question: z.string().min(3).max(200),
        options: z.array(z.string().min(1).max(60)).min(2).max(5),
      }),
    }),
  };
}
