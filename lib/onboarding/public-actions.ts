"use server";

// PUBLIC — no auth. The "Join the waitlist" form (0130), open only while the
// registration workflow is on. The honeypot, the checks and a limit per
// email guard it; it writes with the service role.

import { createAdminClient } from "../supabase/admin";
import { sendPushToPermission } from "../notifications/push";
import { composeForRegistration } from "./compose";
import { deliver } from "./deliver";
import { loadWords, workflowOn } from "./server";
import { intakeOf, waitlistProblem, type WaitlistInput } from "./waitlist-form";

export async function joinWaitlist(input: WaitlistInput, honeypot: string): Promise<{ error?: string }> {
  if (honeypot && honeypot.trim()) return {}; // bot
  const problem = waitlistProblem(input);
  if (problem) return { error: problem };
  const db = createAdminClient();
  const settings = await workflowOn(db);
  if (!settings) return { error: "The waitlist isn't open on this page right now. Email lightningbasketballomaha@gmail.com and we'll add you." };

  const email = input.email.trim().toLowerCase();
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await db.from("olb_registrations").select("id", { count: "exact", head: true }).eq("parent_email", email).gte("created_at", hourAgo);
  if ((count ?? 0) >= 6) return { error: "We've had a few from this email already. Try again in an hour, or email us." };

  const first = input.athlete_first.trim().slice(0, 60);
  const last = input.athlete_last.trim().slice(0, 60);
  // Already waiting (a double tap, or joining twice): nothing new to add.
  const { data: dupes } = await db
    .from("olb_registrations")
    .select("id")
    .eq("board_id", settings.board_id)
    .in("status", ["waitlisted", "pending"])
    .ilike("first_name", first.replace(/[%_\\]/g, (c) => `\\${c}`))
    .ilike("last_name", last.replace(/[%_\\]/g, (c) => `\\${c}`))
    .eq("dob", input.athlete_dob)
    .limit(1);
  if (dupes?.length) return {};

  const parentName = `${input.parent_first.trim()} ${input.parent_last.trim()}`.trim().slice(0, 120);
  const { data: saved, error } = await db
    .from("olb_registrations")
    .insert({
      board_id: settings.board_id,
      first_name: first,
      last_name: last,
      dob: input.athlete_dob,
      parent_name: parentName,
      parent_email: email,
      parent_phone: input.phone.trim().slice(0, 40) || null,
      status: "waitlisted",
      notes: input.homeschooled === false ? "Not homeschooled, from the waitlist form." : null,
      extra: { source: "waitlist_form", first_season: true, intake: intakeOf(input) },
    })
    .select("id, first_name, parent_name, parent_email, extra")
    .single();
  if (error || !saved) return { error: "Something went wrong saving that. Please try again." };
  const reg = saved as { id: string; first_name: string; parent_name: string | null; parent_email: string | null; extra: Record<string, never> | null };

  await sendPushToPermission("registrations", {
    title: `New on the waitlist: ${first} ${last}`,
    body: `From ${parentName}. Tap to see their answers.`,
    url: "/portal/directory/registrations?tab=waitlist",
    tag: `waitlist-${reg.id}`,
  });
  await deliver(db, settings, "waitlist_reply", `waitlist_reply:${reg.id}`, composeForRegistration("waitlist_reply", reg, await loadWords(db))).catch((e) => {
    console.error("[onboarding] waitlist reply failed", e);
    return "failed" as const;
  });
  return {};
}
