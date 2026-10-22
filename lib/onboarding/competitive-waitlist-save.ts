// Server-only. Writes a 10U–14U competitive waitlist row. Preview and
// local only: production (VERCEL_ENV=production) is refused and never writes.
// Callers still must not point a preview at production data if they want to
// keep live rows untouched.

import { createAdminClient } from "../supabase/admin";
import { sendPushToPermission } from "../notifications/push";
import {
  COMPETITIVE_MISSING_DB,
  COMPETITIVE_NOT_OPEN,
  COMPETITIVE_RATE_LIMITED,
  competitiveExtra,
  competitiveNotes,
  competitiveSaveGate,
  friendlyCompetitiveDbError,
  primaryParent,
  type CompetitiveWaitlistInput,
} from "./competitive-waitlist-form";
import { seasonBoardId } from "./server";

export type CompetitiveSaveResult = {
  error?: string;
  id?: string;
  status: number;
};

function logSaveFailure(reason: string, extra?: Record<string, unknown>) {
  console.error("[10u-14u-waitlist] save failed", {
    reason,
    vercelEnv: process.env.VERCEL_ENV ?? "(unset)",
    ...extra,
  });
}

export async function saveCompetitiveWaitlist(
  input: CompetitiveWaitlistInput,
  honeypot: string,
  env: Record<string, string | undefined> = process.env,
): Promise<CompetitiveSaveResult> {
  try {
    const gated = competitiveSaveGate(input, honeypot, env);
    if (gated) {
      if (gated.error) {
        logSaveFailure(
          gated.status === 403 ? "production_write_guard" : gated.status === 503 ? "missing_database_env" : "validation",
          gated.status === 503
            ? { hasUrl: Boolean(env.NEXT_PUBLIC_SUPABASE_URL), hasServiceRole: Boolean(env.SUPABASE_SERVICE_ROLE_KEY) }
            : undefined,
        );
      }
      return gated;
    }

    const db = createAdminClient();
    const boardId = await seasonBoardId(db);
    if (!boardId) {
      logSaveFailure("no_season_board");
      return { error: COMPETITIVE_NOT_OPEN, status: 503 };
    }

    const parent = primaryParent(input);
    const email = parent.email;
    const hourAgo = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await db.from("olb_registrations").select("id", { count: "exact", head: true }).eq("parent_email", email).gte("created_at", hourAgo);
    if ((count ?? 0) >= 6) return { error: COMPETITIVE_RATE_LIMITED, status: 429 };

    const first = input.athlete_first.trim().slice(0, 60);
    const last = input.athlete_last.trim().slice(0, 60);
    const { data: dupes } = await db
      .from("olb_registrations")
      .select("id")
      .eq("board_id", boardId)
      .in("status", ["waitlisted", "pending"])
      .ilike("first_name", first.replace(/[%_\\]/g, (c) => `\\${c}`))
      .ilike("last_name", last.replace(/[%_\\]/g, (c) => `\\${c}`))
      .eq("dob", input.athlete_dob)
      .limit(1);
    if (dupes?.length) return { id: dupes[0].id as string, status: 200 };

    const { data: saved, error } = await db
      .from("olb_registrations")
      .insert({
        board_id: boardId,
        first_name: first,
        last_name: last,
        dob: input.athlete_dob,
        parent_name: parent.name,
        parent_email: email || null,
        parent_phone: parent.phone || null,
        status: "waitlisted",
        notes: competitiveNotes(input),
        extra: competitiveExtra(input),
      })
      .select("id")
      .single();
    if (error || !saved) {
      logSaveFailure("insert", {
        code: error?.code ?? null,
        message: error?.message ?? null,
        details: error?.details ?? null,
        hint: error?.hint ?? null,
      });
      return { error: friendlyCompetitiveDbError(error), status: 500 };
    }

    await sendPushToPermission("registrations", {
      title: `New 10U-14U waitlist: ${first} ${last}`,
      body: `From ${parent.name}. Tap to see their answers.`,
      url: "/portal/directory/registrations?tab=waitlist",
      tag: `waitlist-${saved.id}`,
    });
    return { id: saved.id as string, status: 200 };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    const missingEnv = /NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY/.test(message);
    logSaveFailure(missingEnv ? "missing_database_env" : "exception", { message });
    return { error: missingEnv ? COMPETITIVE_MISSING_DB : friendlyCompetitiveDbError({ message }), status: missingEnv ? 503 : 500 };
  }
}
