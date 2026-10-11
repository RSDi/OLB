// Server-only. Reads the registration workflow's settings (0130) for the
// season the registration form registers for. Runs with the service role,
// so callers check access first (or serve only what the public may see).

import type { SupabaseClient } from "@supabase/supabase-js";
import { REGISTRATION_SEASON } from "../teams/registration-form";
import { defaultSettings, cleanModes, type OnboardingSettings } from "./automations";
import type { FormExtras, UniformItem } from "./form-extras";

export type Db = SupabaseClient;

export async function seasonBoardId(db: Db): Promise<string | null> {
  const { data } = await db.from("olb_boards").select("id").eq("season", REGISTRATION_SEASON).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

// The season's settings; the defaults (everything off) when none are saved
// or before 0130 is applied.
export async function loadSettings(db: Db, boardId: string): Promise<OnboardingSettings> {
  const { data, error } = await db.from("olb_onboarding_settings").select("*").eq("board_id", boardId).maybeSingle();
  if (error || !data) return defaultSettings(boardId);
  const row = data as OnboardingSettings;
  return { ...defaultSettings(boardId), ...row, modes: cleanModes(row.modes) };
}

// The workflow's settings when it's on for the season the form registers
// for, else null: callers then do exactly what they did before 0130.
export async function workflowOn(db: Db): Promise<OnboardingSettings | null> {
  const boardId = await seasonBoardId(db);
  if (!boardId) return null;
  const s = await loadSettings(db, boardId);
  return s.enabled ? s : null;
}

export interface UniformSettings {
  board_id: string;
  try_on: string | null;
  order_deadline: string | null;
  charge_when: "order" | "registration";
  ordered_at: string | null;
}

export async function loadUniforms(db: Db, boardId: string): Promise<{ settings: UniformSettings; items: (UniformItem & { sort_order: number; active: boolean })[] }> {
  const [{ data: s }, { data: items }] = await Promise.all([
    db.from("olb_uniform_settings").select("board_id, try_on, order_deadline, charge_when, ordered_at").eq("board_id", boardId).maybeSingle(),
    db.from("olb_uniform_items").select("id, name, who, price_cents, sizes, sort_order, active").eq("board_id", boardId).order("sort_order").order("name"),
  ]);
  return {
    settings: (s as UniformSettings | null) ?? { board_id: boardId, try_on: null, order_deadline: null, charge_when: "order", ordered_at: null },
    items: ((items as (UniformItem & { sort_order: number; active: boolean })[] | null) ?? []).map((i) => ({ ...i, sizes: i.sizes ?? [] })),
  };
}

// What the public registration form asks on top of today's questions, or
// null with the workflow off.
export async function loadFormExtras(db: Db): Promise<FormExtras | null> {
  const s = await workflowOn(db);
  if (!s) return null;
  const u = await loadUniforms(db, s.board_id);
  return {
    handbookUrl: s.handbook_url,
    items: u.items.filter((i) => i.active && i.sizes.length > 0).map(({ id, name, who, price_cents, sizes }) => ({ id, name, who, price_cents, sizes })),
    tryOn: u.settings.try_on,
  };
}

// Saved email words, "welcome.subject" → value.
export async function loadWords(db: Db): Promise<Record<string, string>> {
  const { data } = await db.from("olb_onboarding_email_text").select("key, value");
  return Object.fromEntries(((data as { key: string; value: string }[] | null) ?? []).map((r) => [r.key, r.value]));
}

export function siteUrl(): string {
  const url =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://omahalightningbasketball.com");
  return url.replace(/\/$/, "");
}

export function newToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

export const checklistUrl = (token: string) => `${siteUrl()}/family/${token}`;
export const offerUrl = (token: string) => `${siteUrl()}/player-registration?offer=${token}`;
