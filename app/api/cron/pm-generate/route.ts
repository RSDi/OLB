// Vercel Cron endpoint — daily PM instance generation.
//
// For each active, non-deleted template:
//   - skip if an open (pending or in_progress) instance already exists
//   - skip if the computed next-scheduled-for date is still in the future
//   - otherwise generate via the shared `generatePmInstance` helper, using
//     the admin client (no user session during cron runs)
//
// Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically when
// the schedule is configured in vercel.json. Manual curl invocations need
// the same header.

import { NextResponse } from "next/server";
import { createAdminClient } from "../../../../lib/supabase/admin";
import {
  computeNextScheduledFor,
  type ScheduleKind,
} from "../../../../lib/pm/schedule";
import { generatePmInstance } from "../../../../lib/pm/generate";

interface TemplateRow {
  id: string;
  title: string;
  schedule_kind: ScheduleKind;
  schedule_value: number;
}

export async function GET(request: Request) {
  // When CRON_SECRET is unset, fail closed with the same 401 as a bad secret —
  // a different status would tell probers the deployment is misconfigured.
  const expectedSecret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!expectedSecret || auth !== `Bearer ${expectedSecret}`) {
    if (!expectedSecret) console.error("pm-generate: CRON_SECRET not configured");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      {
        error:
          "SUPABASE_SERVICE_ROLE_KEY not set; cron cannot insert PM instances (RLS blocks unauthenticated writes).",
      },
      { status: 500 }
    );
  }

  const admin = createAdminClient();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data: templatesRaw, error: templatesError } = await admin
    .from("pm_templates")
    .select("id, title, schedule_kind, schedule_value")
    .eq("active", true)
    .is("deleted_at", null);
  if (templatesError) {
    return NextResponse.json({ error: templatesError.message }, { status: 500 });
  }
  const templates = (templatesRaw as TemplateRow[]) ?? [];

  const results = {
    timestamp: new Date().toISOString(),
    templates_scanned: templates.length,
    instances_generated: 0,
    skipped: [] as { id: string; title: string; reason: string }[],
    errors: [] as { id: string; title: string; error: string }[],
  };

  for (const t of templates) {
    const { count: pendingCount, error: pendingError } = await admin
      .from("pm_instances")
      .select("id", { count: "exact", head: true })
      .eq("template_id", t.id)
      .is("deleted_at", null)
      .in("status", ["pending", "in_progress"]);
    if (pendingError) {
      results.errors.push({ id: t.id, title: t.title, error: pendingError.message });
      continue;
    }
    if ((pendingCount ?? 0) > 0) {
      results.skipped.push({ id: t.id, title: t.title, reason: "open instance exists" });
      continue;
    }

    const { data: lastDone } = await admin
      .from("pm_instances")
      .select("completed_at")
      .eq("template_id", t.id)
      .eq("status", "done")
      .not("completed_at", "is", null)
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextScheduled = computeNextScheduledFor({
      kind: t.schedule_kind,
      value: t.schedule_value,
      lastCompletedAt: lastDone?.completed_at ? new Date(lastDone.completed_at) : null,
      today,
    });

    if (nextScheduled > today) {
      results.skipped.push({
        id: t.id,
        title: t.title,
        reason: `next scheduled ${nextScheduled.toISOString().slice(0, 10)}`,
      });
      continue;
    }

    const genResult = await generatePmInstance(admin, t.id);
    if (genResult.error) {
      results.errors.push({ id: t.id, title: t.title, error: genResult.error });
    } else {
      results.instances_generated += 1;
    }
  }

  return NextResponse.json(results);
}
