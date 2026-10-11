// Server-only. Spot offers (0130): the private registration link a family
// gets when someone presses Offer a spot on the Waitlist tab.

import { createAdminClient } from "../supabase/admin";
import { shortDay, longDay } from "./dates";
import { workflowOn } from "./server";

export interface OfferSeedData {
  token: string;
  first: string;
  last: string;
  dob: string | null;
  email: string | null;
  expires: string;
}

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
      .select("status, expires_at, reg:olb_registrations(first_name, last_name, dob, parent_email, status)")
      .eq("token", token)
      .eq("board_id", settings.board_id)
      .maybeSingle();
    const o = data as unknown as {
      status: string;
      expires_at: string;
      reg: { first_name: string; last_name: string; dob: string | null; parent_email: string | null; status: string } | null;
    } | null;
    if (!o?.reg) return "expired";
    if (o.status !== "open" || new Date(o.expires_at).getTime() < Date.now() || o.reg.status !== "waitlisted") return "expired";
    return {
      token,
      first: o.reg.first_name,
      last: o.reg.last_name,
      dob: o.reg.dob,
      email: o.reg.parent_email,
      expires: shortDay(expiryDay(o.expires_at)),
    };
  } catch (e) {
    console.error("[onboarding] loading an offer failed", e);
    return null;
  }
}

// The Omaha day an offer runs out.
export function expiryDay(expiresAt: string): string {
  return new Date(expiresAt).toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
}

export function expiryWords(expiresAt: string): string {
  return longDay(expiryDay(expiresAt));
}
