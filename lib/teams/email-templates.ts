// Email templates (0117): ready-made subjects and messages the board keeps in
// Settings → Email Templates and picks from when emailing families. Plain
// module (no "use server"), safe for client and server, and pure, so tests
// can run it.

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  // Set on a template the portal starts a message with (WAITLIST_TEMPLATE).
  slug: string | null;
}

// The waitlist's "teams are full" message (added by 0117): the waitlist's
// message window starts from it, so the board's wording is what goes out.
export const WAITLIST_TEMPLATE = "waitlist";

export interface EmailTemplateInput {
  name: string;
  subject: string;
  body: string;
}

export const TEMPLATE_NAME_MAX = 80;
export const TEMPLATE_SUBJECT_MAX = 200;
// The same limit as a message sent from the portal.
export const TEMPLATE_BODY_MAX = 4000;

export const EMAIL_TEMPLATE_COLUMNS = "id, name, subject, body, slug";

// Trimmed and checked, or what's wrong in words people can act on.
export function cleanTemplate(input: EmailTemplateInput): EmailTemplateInput | { error: string } {
  const name = (input?.name ?? "").trim();
  const subject = (input?.subject ?? "").trim();
  // Line breaks inside the message stay; only the ends are trimmed.
  const body = (input?.body ?? "").replace(/\r\n/g, "\n").trim();
  if (!name) return { error: "Give the template a name." };
  if (name.length > TEMPLATE_NAME_MAX) return { error: `Keep the name to ${TEMPLATE_NAME_MAX} characters.` };
  if (!subject) return { error: "Add a subject." };
  if (subject.length > TEMPLATE_SUBJECT_MAX) return { error: `Keep the subject to ${TEMPLATE_SUBJECT_MAX} characters.` };
  if (!body) return { error: "Add a message." };
  if (body.length > TEMPLATE_BODY_MAX) return { error: "Keep the message to 4,000 characters." };
  return { name, subject, body };
}

// Sorted the way the Template list shows them: by name, ignoring case.
export function sortTemplates<T extends { name: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}
