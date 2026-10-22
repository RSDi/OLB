// Server-only. Spot offers (0130): the private registration link a family
// gets when someone presses Offer a spot on the Waitlist tab.

import { createAdminClient } from "../supabase/admin";
import { longDay } from "./dates";
import { expiryDay, offerSeedFromRow, type OfferRegRow, type OfferSeedData } from "./offer-seed";
import { workflowOn } from "./server";

export type { OfferSeedData } from "./offer-seed";
export { expiryDay } from "./offer-seed";

// The offer behind a link, for the registration page to start from: null
// when the workflow is off, or the link ran out or was used.
export async function loadOfferSeed(token: string | undefined): Promise<OfferSeedData | "expired" | null> {
  if (!token || !/^[A-Za-z0-9_-]{24,80}$/.test(token)) return null;
  try {
    const db = createAdminClient();
    const settings = await workflowOn(db);
    if (!settings) return null;
    const { data } = await db
      .from("olb_onboarding_offers")
      .select("status, expires_at, reg:olb_registrations(first_name, last_name, dob, parent_email, parent_name, parent_phone, extra, status)")
      .eq("token", token)
      .eq("board_id", settings.board_id)
      .maybeSingle();
    const o = data as unknown as {
      status: string;
      expires_at: string;
      reg: (OfferRegRow & { status: string }) | null;
    } | null;
    if (!o?.reg) return "expired";
    if (o.status !== "open" || new Date(o.expires_at).getTime() < Date.now() || o.reg.status !== "waitlisted") return "expired";
    return offerSeedFromRow(token, o.expires_at, o.reg);
  } catch (e) {
    console.error("[onboarding] loading an offer failed", e);
    return null;
  }
}

export function expiryWords(expiresAt: string): string {
  return longDay(expiryDay(expiresAt));
}
