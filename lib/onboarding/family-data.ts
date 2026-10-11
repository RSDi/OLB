// Server-only. Each family in the registration workflow (0130), with its
// checklist worked out: registrations, players and teams, Payments balance,
// handbook, uniform sizes and Slack. The family's page, the automatic
// emails and the Onboarding tab all use it. Service role; callers check
// access (or hold the family's private link).

import type { RegistrationExtra } from "../teams/roster-logic";
import { PAYMENT_INSTRUCTIONS } from "../finances/types";
import { registrationFeeCents } from "../finances/logic";
import { buildChecklist, type ChecklistItem, type RegStatus } from "./checklist";
import { itemsFor, type UniformItem } from "./form-extras";
import type { OnboardingSettings } from "./automations";
import { loadUniforms, type Db } from "./server";

export type WorkflowExtra = RegistrationExtra & {
  source?: string;
  submission_key?: string;
  handbook?: { agreed: boolean; player_name: string; parent_name: string; signed_on: string; url: string | null } | null;
  uniform_sizes?: Record<string, string>;
  intake?: Record<string, unknown>;
};

export interface FamilyReg {
  id: string;
  first_name: string;
  last_name: string;
  status: RegStatus;
  created_at: string;
  player_id: string | null;
  parent_email: string | null;
  extra: WorkflowExtra;
}

export interface FamilyView {
  id: string;
  token: string;
  boardId: string;
  createdAt: string;
  lastSeenAt: string | null;
  registrations: FamilyReg[];
  players: { id: string; name: string; teamId: string | null; team: string | null; practiceTimes: string[]; practiceLocation: string | null; coaches: string[] }[];
  // Who to write to, and who to greet.
  emails: string[];
  greeting: string;
  playerNames: string; // "Sam and Evan"
  items: ChecklistItem[];
}

interface FamilyRow {
  id: string;
  board_id: string;
  token: string;
  email: string | null;
  registration_ids: string[];
  created_at: string;
  last_seen_at: string | null;
}

const lower = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

export async function loadFamilies(db: Db, settings: OnboardingSettings, filter?: { ids?: string[]; token?: string }): Promise<FamilyView[]> {
  let q = db.from("olb_onboarding_families").select("id, board_id, token, email, registration_ids, created_at, last_seen_at").eq("board_id", settings.board_id);
  if (filter?.ids) q = q.in("id", filter.ids.length ? filter.ids : ["00000000-0000-0000-0000-000000000000"]);
  if (filter?.token) q = q.eq("token", filter.token);
  const { data: fams } = await q;
  const families = (fams as FamilyRow[] | null) ?? [];
  if (families.length === 0) return [];

  const regIds = [...new Set(families.flatMap((f) => f.registration_ids))];
  const { data: regData } = await db
    .from("olb_registrations")
    .select("id, first_name, last_name, status, created_at, player_id, parent_email, extra")
    .in("id", regIds);
  const regs = new Map(((regData as FamilyReg[] | null) ?? []).map((r) => [r.id, { ...r, extra: r.extra ?? {} }]));
  const playerIds = [...new Set([...regs.values()].map((r) => r.player_id).filter((x): x is string => !!x))];

  const none = ["00000000-0000-0000-0000-000000000000"];
  const [{ data: players }, { data: charges }, { data: payments }, { data: handbookReq }, uniforms, { data: sizeRows }] = await Promise.all([
    db.from("olb_players").select("id, full_name, team_id, team:olb_teams(id, name, practice_times, practice_location)").in("id", playerIds.length ? playerIds : none),
    db.from("olb_charges").select("player_id, kind, amount_cents").in("player_id", playerIds.length ? playerIds : none).is("voided_at", null),
    db.from("olb_payments").select("player_id, amount_cents").in("player_id", playerIds.length ? playerIds : none).is("voided_at", null),
    db.from("olb_requirements").select("id").ilike("name", "handbook signature").is("deleted_at", null).limit(1).maybeSingle(),
    loadUniforms(db, settings.board_id),
    db.from("olb_uniform_sizes").select("registration_id, player_id, item_id").eq("board_id", settings.board_id),
  ]);
  type PlayerRow = { id: string; full_name: string; team_id: string | null; team: { id: string; name: string; practice_times: string[] | null; practice_location: string | null } | null };
  const playerById = new Map(((players as unknown as PlayerRow[] | null) ?? []).map((p) => [p.id, p]));

  const teamIds = [...new Set([...playerById.values()].map((p) => p.team_id).filter((x): x is string => !!x))];
  const [{ data: coaches }, { data: done }, { data: slack }] = await Promise.all([
    db.from("olb_coaches").select("team_id, name, role, sort_order").in("team_id", teamIds.length ? teamIds : none).order("sort_order"),
    handbookReq
      ? db.from("olb_player_requirements").select("player_id").eq("requirement_id", (handbookReq as { id: string }).id).in("player_id", playerIds.length ? playerIds : none)
      : Promise.resolve({ data: [] as { player_id: string }[] }),
    db.from("olb_onboarding_slack").select("email, joined"),
  ]);
  const handbookDone = new Set(((done as { player_id: string }[] | null) ?? []).map((d) => d.player_id));
  const joined = new Set(((slack as { email: string; joined: boolean }[] | null) ?? []).filter((s) => s.joined).map((s) => s.email));
  const checkedSlack = new Set(((slack as { email: string }[] | null) ?? []).map((s) => s.email));
  const items: UniformItem[] = uniforms.items.filter((i) => i.active);
  const sizes = (sizeRows as { registration_id: string | null; player_id: string | null; item_id: string }[] | null) ?? [];

  const balance = new Map<string, number>();
  const charged = new Set<string>();
  for (const c of (charges as { player_id: string; kind: string; amount_cents: number }[] | null) ?? []) {
    balance.set(c.player_id, (balance.get(c.player_id) ?? 0) + (c.kind === "charge" ? c.amount_cents : -c.amount_cents));
    if (c.kind === "charge") charged.add(c.player_id);
  }
  for (const p of (payments as { player_id: string; amount_cents: number }[] | null) ?? []) balance.set(p.player_id, (balance.get(p.player_id) ?? 0) - p.amount_cents);

  return families.map((f) => {
    const fr = f.registration_ids.map((id) => regs.get(id)).filter((r): r is FamilyReg => !!r);
    const live = fr.filter((r) => r.status !== "rejected");
    const famPlayers = live
      .map((r) => (r.player_id ? playerById.get(r.player_id) : undefined))
      .filter((p): p is PlayerRow => !!p)
      .map((p) => ({
        id: p.id,
        name: p.full_name,
        teamId: p.team?.id ?? null,
        team: p.team?.name ?? null,
        practiceTimes: p.team?.practice_times ?? [],
        practiceLocation: p.team?.practice_location ?? null,
        coaches: ((coaches as { team_id: string; name: string }[] | null) ?? []).filter((c) => c.team_id === p.team_id).map((c) => c.name),
      }));

    const emails = [...new Set([f.email, ...fr.flatMap((r) => [r.extra.father?.email, r.extra.mother?.email, r.parent_email])].map(lower).filter((e) => e.includes("@")))];
    const anyPlayerCharged = famPlayers.some((p) => charged.has(p.id));
    const balanceCents = anyPlayerCharged ? famPlayers.reduce((n, p) => n + (balance.get(p.id) ?? 0), 0) : null;

    const x0 = fr[0]?.extra ?? {};
    const greet =
      [x0.father, x0.mother].find((p) => p?.email && lower(p.email) === lower(f.email))?.first?.trim() ||
      x0.mother?.first?.trim() ||
      x0.father?.first?.trim() ||
      "there";

    const checklist = buildChecklist({
      registeredOn: (fr[0]?.created_at ?? f.created_at).slice(0, 10),
      players: live.map((r) => {
        const own = itemsFor({ needs_uniform: r.extra.needs_uniform ?? null, needs_grays: r.extra.needs_grays ?? null, fee_tier: r.extra.fee_tier ?? "" }, items).filter((i) => i.who !== "optional");
        const have = new Set(sizes.filter((s) => s.registration_id === r.id || (r.player_id && s.player_id === r.player_id)).map((s) => s.item_id));
        const player = r.player_id ? playerById.get(r.player_id) : undefined;
        return {
          first: r.first_name,
          status: r.status,
          team: player?.team?.name ?? null,
          handbookSigned: r.extra.handbook?.agreed === true || (!!r.player_id && handbookDone.has(r.player_id)),
          sizesNeeded: r.extra.source === "waitlist_form" ? 0 : own.length,
          sizesIn: own.filter((i) => have.has(i.id)).length,
        };
      }),
      balanceCents,
      expectedCents: live.reduce((n, r) => n + (registrationFeeCents(r.extra.fee_tier) ?? 0), 0),
      slackJoined: emails.some((e) => joined.has(e)) ? true : emails.some((e) => checkedSlack.has(e)) ? false : null,
      slackUrl: settings.slack_invite_url,
      handbookUrl: settings.handbook_url,
      parentMeeting: settings.parent_meeting,
      parentMeetingOn: settings.parent_meeting_on,
      firstPracticeOn: settings.first_practice_on,
      tryOn: uniforms.settings.try_on,
      venmo: PAYMENT_INSTRUCTIONS.venmoHandle,
    });

    const firsts = [...new Set(live.map((r) => r.first_name.trim()).filter(Boolean))];
    return {
      id: f.id,
      token: f.token,
      boardId: f.board_id,
      createdAt: f.created_at,
      lastSeenAt: f.last_seen_at,
      registrations: fr,
      players: famPlayers,
      emails,
      greeting: greet,
      playerNames: firsts.length <= 1 ? firsts[0] ?? "your player" : `${firsts.slice(0, -1).join(", ")} and ${firsts[firsts.length - 1]}`,
      items: checklist,
    };
  });
}
