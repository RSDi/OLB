// Server-only. Where the registration workflow (0130) joins today's
// registration code: after a family sends the form, and after a
// registration is approved. Each one does nothing unless the workflow is on
// for that season, so with the switch off registration works exactly as it
// did before. Best effort: a failure here is logged and never undoes the
// registration or the approval.

import { centralToday } from "../finances/data";
import { deliver } from "./deliver";
import { compose } from "./compose";
import { loadFamilies } from "./family-data";
import { chargePlan } from "./uniforms";
import { loadSettings, loadUniforms, loadWords, newToken, type Db } from "./server";
import type { OnboardingSettings } from "./automations";

// The family's checklist link and the sizes they picked, saved with the
// registrations. A second send with the same submit key finds the same
// family. Returns the link's token.
export async function afterSubmit(
  db: Db,
  settings: OnboardingSettings,
  args: { submissionKey: string; email: string | null; regIds: string[]; sizes: { regId: string; sizes: Record<string, string> }[] }
): Promise<string | null> {
  try {
    const { data: found } = await db.from("olb_onboarding_families").select("id, token, registration_ids").eq("submission_key", args.submissionKey).maybeSingle();
    let token = (found as { token: string } | null)?.token ?? null;
    if (found) {
      const ids = [...new Set([...(found as { registration_ids: string[] }).registration_ids, ...args.regIds])];
      await db.from("olb_onboarding_families").update({ registration_ids: ids }).eq("id", (found as { id: string }).id);
    } else {
      token = newToken();
      const { error } = await db.from("olb_onboarding_families").insert({
        board_id: settings.board_id,
        submission_key: args.submissionKey,
        token,
        email: args.email,
        registration_ids: args.regIds,
      });
      if (error) {
        console.warn(`[onboarding] saving the family link failed: ${error.message}`);
        token = null;
      }
    }
    const rows = args.sizes.flatMap((s) =>
      Object.entries(s.sizes).map(([item_id, size]) => ({ board_id: settings.board_id, registration_id: s.regId, item_id, size }))
    );
    if (rows.length) {
      const { error } = await db.from("olb_uniform_sizes").upsert(rows, { onConflict: "registration_id,item_id", ignoreDuplicates: true });
      if (error) console.warn(`[onboarding] saving uniform sizes failed: ${error.message}`);
    }
    return token;
  } catch (e) {
    console.error("[onboarding] after submit failed", e);
    return null;
  }
}

// After Approve (by a person or automatically): the family gets a checklist
// if they don't have one, their sizes and handbook signature follow the
// player onto the roster, uniform charges go on when Sarah charges at
// registration, and once nobody in the family is still waiting for review,
// the "You're in" email (if its switch is on).
export async function afterApprove(db: Db, regId: string, playerId: string, userId: string | null): Promise<void> {
  try {
    const { data: reg } = await db.from("olb_registrations").select("id, board_id, parent_email, extra").eq("id", regId).maybeSingle();
    if (!reg) return;
    const r = reg as { id: string; board_id: string; parent_email: string | null; extra: Record<string, unknown> | null };
    const settings = await loadSettings(db, r.board_id);
    if (!settings.enabled) return;

    // The family: the one from the form, or a new one for this registration.
    const { data: fam } = await db.from("olb_onboarding_families").select("id").contains("registration_ids", [regId]).limit(1).maybeSingle();
    let familyId = (fam as { id: string } | null)?.id ?? null;
    if (!familyId) {
      const { data: made } = await db
        .from("olb_onboarding_families")
        .upsert({ board_id: r.board_id, submission_key: `reg:${regId}`, token: newToken(), email: r.parent_email, registration_ids: [regId] }, { onConflict: "submission_key" })
        .select("id")
        .maybeSingle();
      familyId = (made as { id: string } | null)?.id ?? null;
    }

    await db.from("olb_uniform_sizes").update({ player_id: playerId }).eq("registration_id", regId);

    const handbook = (r.extra?.handbook ?? null) as { agreed?: boolean; player_name?: string; parent_name?: string; signed_on?: string } | null;
    if (handbook?.agreed) {
      const { data: req } = await db.from("olb_requirements").select("id").ilike("name", "handbook signature").is("deleted_at", null).limit(1).maybeSingle();
      if (req) {
        const { error } = await db.from("olb_player_requirements").upsert(
          {
            player_id: playerId,
            requirement_id: (req as { id: string }).id,
            status: "done",
            completed_on: handbook.signed_on || centralToday(),
            note: `Signed on the registration form by ${handbook.player_name} and ${handbook.parent_name}.`.slice(0, 500),
            marked_by: userId,
          },
          { onConflict: "player_id,requirement_id", ignoreDuplicates: true }
        );
        if (error) console.warn(`[onboarding] checking off the handbook failed: ${error.message}`);
      }
    }

    const uniforms = await loadUniforms(db, r.board_id);
    if (uniforms.settings.charge_when === "registration") await chargeUniforms(db, r.board_id, { registrationId: regId }, userId);

    if (familyId) {
      const [family] = await loadFamilies(db, settings, { ids: [familyId] });
      if (family && !family.registrations.some((x) => x.status === "pending")) {
        await deliver(db, settings, "welcome", `welcome:${familyId}`, compose("welcome", family, settings, await loadWords(db)));
      }
    }
  } catch (e) {
    console.error("[onboarding] after approve failed", e);
  }
}

// Puts uniform charges on families' Payments accounts for sizes not charged
// yet: one registration's, or the whole season's when the order goes in.
export async function chargeUniforms(
  db: Db,
  boardId: string,
  scope: { registrationId?: string },
  userId: string | null
): Promise<{ added: number; noPrice: string[]; notOnRoster: number; error?: string }> {
  const { items } = await loadUniforms(db, boardId);
  let q = db.from("olb_uniform_sizes").select("id, item_id, size, player_id, charge_id").eq("board_id", boardId).is("charge_id", null);
  if (scope.registrationId) q = q.eq("registration_id", scope.registrationId);
  const { data } = await q;
  const plan = chargePlan(items, (data as { id: string; item_id: string; size: string; player_id: string | null; charge_id: string | null }[] | null) ?? []);
  let added = 0;
  for (const c of plan.charges) {
    const { data: charge, error } = await db
      .from("olb_charges")
      .insert({
        board_id: boardId,
        player_id: c.player_id,
        kind: "charge",
        category: "uniform",
        description: c.description,
        amount_cents: c.amount_cents,
        entry_date: centralToday(),
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) return { added, noPrice: plan.noPrice, notOnRoster: plan.notOnRoster, error: error.message };
    await db.from("olb_uniform_sizes").update({ charge_id: (charge as { id: string }).id }).eq("id", c.size_id);
    added++;
  }
  return { added, noPrice: plan.noPrice, notOnRoster: plan.notOnRoster };
}
