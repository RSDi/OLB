// The optional box on the public Our Programs page (yellow hero). Edited in
// Settings → Messages by anyone with the Registrations permission. Off by
// default so the live page stays as it is. Plain module, safe for client
// and server.
//
// The table is olb_homepage_messages (0160). Do not use
// olb_registration_messages — that is the waitlist email log (0115).

import { normalizeMenuHref } from "./menu.ts"; // explicit extension so node --test can load this file

// Same address the 14U assessment form uses (PROGRAMS_INFO_URL).
export const PROGRAMS_HERO_LINK_URL = "https://omahalightningbasketball.com/programs";

export const PROGRAMS_HERO_KEY = "programs_hero";
export const HOMEPAGE_MESSAGE_TAG = "homepage-message";

export const PROGRAMS_HERO_BODY =
  "Now accepting two more 14U players. If your son is interested in being considered, sign up for an assessment below. Playing for Omaha Lightning is a commitment to a competitive team from October through February. Practices have already begun, so assessments will be scheduled right away. See practice times and payment info.";

export const PROGRAMS_HERO_LINK_TEXT = "Practice times and payment info";

export const BODY_MAX = 2000;
export const LINK_TEXT_MAX = 120;
export const LINK_URL_MAX = 500;

export type HomepageMessage = {
  key: string;
  enabled: boolean;
  body: string;
  link_text: string;
  link_url: string;
  updated_at?: string | null;
  updated_by?: string | null;
};

export type HomepageMessageInput = {
  enabled: boolean;
  body: string;
  link_text: string;
  link_url: string;
};

export const DEFAULT_PROGRAMS_HERO: HomepageMessage = {
  key: PROGRAMS_HERO_KEY,
  enabled: false,
  body: PROGRAMS_HERO_BODY,
  link_text: PROGRAMS_HERO_LINK_TEXT,
  link_url: PROGRAMS_HERO_LINK_URL,
};

export type VisibleHomepageMessage = {
  body: string;
  linkText: string;
  linkUrl: string;
};

export function tableMissing(error: { code?: string; message?: string; details?: string } | null | undefined): boolean {
  const msg = `${error?.code ?? ""} ${error?.message ?? ""} ${error?.details ?? ""}`.toLowerCase();
  return /42p01|pgrst205|does not exist|schema cache|could not find the table/.test(msg);
}

export function cleanHomepageMessage(input: HomepageMessageInput): { value: HomepageMessageInput } | { error: string } {
  const body = input.body.trim();
  if (body.length > BODY_MAX) return { error: `Keep the wording to ${BODY_MAX.toLocaleString()} characters or fewer.` };
  const link_text = input.link_text.trim();
  if (link_text.length > LINK_TEXT_MAX) return { error: `Keep the link words to ${LINK_TEXT_MAX} characters or fewer.` };
  const rawUrl = input.link_url.trim();
  if (rawUrl.length > LINK_URL_MAX) return { error: `Keep the link address to ${LINK_URL_MAX} characters or fewer.` };
  const link_url = rawUrl ? normalizeMenuHref(rawUrl) : "";
  if (rawUrl && !link_url) {
    return { error: "The link needs to be a site page like /programs or a web address like https://example.com." };
  }
  if (link_text && !link_url) return { error: "Add the link address, or clear the link words." };
  if (link_url && !link_text) return { error: "Add the link words, or clear the link address." };
  return { value: { enabled: !!input.enabled, body, link_text, link_url: link_url || "" } };
}

// What the public page may show. Hidden when the table is missing, the
// switch is off, or the wording is empty.
export function visibleHomepageMessage(
  message: HomepageMessage | null | undefined,
  fromTable: boolean,
): VisibleHomepageMessage | null {
  if (!fromTable || !message?.enabled) return null;
  const body = message.body.trim();
  if (!body) return null;
  const linkText = message.link_text.trim();
  const linkUrl = message.link_url.trim() ? normalizeMenuHref(message.link_url) : "";
  return { body, linkText, linkUrl: linkUrl || "" };
}
