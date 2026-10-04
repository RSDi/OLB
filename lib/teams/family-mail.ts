// Emailing families from the portal: who a player's emails go to (Dad, Mom,
// a guardian, the player), one email per family when brothers and sisters
// share parents, and {player} in the message. The waitlist (0115) and the
// Directory (0116) both use it. Plain module (no "use server"), safe for
// client and server, and pure, so tests can run it.

export type Recipient = "father" | "mother" | "guardian" | "player";
export const ALL_RECIPIENTS: Recipient[] = ["father", "mother", "guardian", "player"];
const PARENTS: Recipient[] = ["father", "mother", "guardian"];

export interface Contact {
  role: Recipient;
  name: string;
  email: string;
}

// Who a message is about: a player, with the people who can be emailed.
export interface MailTarget {
  id: string;
  first_name: string;
  name: string;
  contacts: Contact[];
}

// An email sent to a family from the portal, as its page lists it.
export interface SentMessage {
  id: string;
  subject: string;
  body: string;
  sent_to: string[];
  sent_at: string;
  sent_by_name: string | null;
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;
export const cleanEmail = (e: string | null | undefined) => {
  const v = e?.trim().toLowerCase();
  return v && EMAIL.test(v) ? v : null;
};

// "Chris Carter" from the form's first and last name, skipping "N/A".
export const personName = (p?: { first?: string; last?: string }) =>
  [p?.first, p?.last].map((s) => s?.trim()).filter((s) => s && !/^n\/?a$/i.test(s)).join(" ");

// Every email among a player's contacts for the people picked, once each.
export function contactEmails(contacts: Contact[], roles: Recipient[] = ALL_RECIPIENTS): string[] {
  return [...new Set(contacts.filter((c) => roles.includes(c.role)).map((c) => c.email))];
}

// The people picked who have an email, in the order the boxes show.
export function rolesPresent(contacts: Contact[]): Recipient[] {
  return ALL_RECIPIENTS.filter((r) => contacts.some((c) => c.role === r));
}

export interface FamilyGroup<T> {
  emails: string[];
  players: T[];
}

// Brothers and sisters share parents, so they're one family and get one
// email between them, to the parents and players picked. A family with no
// email for anyone picked is left out.
export function groupByFamily<T extends { id: string }>(
  items: T[],
  contactsOf: (t: T) => Contact[],
  roles: Recipient[] = ALL_RECIPIENTS
): { groups: FamilyGroup<T>[]; noEmail: T[] } {
  const families = new Map<string, T[]>();
  for (const t of items) {
    const parents = contactEmails(contactsOf(t), PARENTS).sort();
    const key = parents.length ? parents.join(",") : `one:${t.id}`;
    families.set(key, [...(families.get(key) ?? []), t]);
  }
  const groups: FamilyGroup<T>[] = [];
  const noEmail: T[] = [];
  for (const members of families.values()) {
    const emails = [...new Set(members.flatMap((t) => contactEmails(contactsOf(t), roles)))];
    if (emails.length) groups.push({ emails, players: members });
    else noEmail.push(...members);
  }
  return { groups, noEmail };
}

// A Directory player (olb_players with its olb_player_parents) as someone to
// email: each parent on the roster with an email, then the player's own.
export interface PlayerWithParents {
  id: string;
  full_name: string;
  email: string | null;
  parents: { relationship: "father" | "mother" | "guardian"; member: { full_name: string | null; email: string | null } | null }[];
}

const PARENT_WORD: Record<"father" | "mother" | "guardian", string> = { father: "Dad", mother: "Mom", guardian: "Guardian" };

export function playerTarget(p: PlayerWithParents): MailTarget {
  const contacts: Contact[] = [];
  for (const pa of p.parents) {
    const email = cleanEmail(pa.member?.email);
    if (email) contacts.push({ role: pa.relationship, name: pa.member?.full_name?.trim() || PARENT_WORD[pa.relationship], email });
  }
  const own = cleanEmail(p.email);
  if (own) contacts.push({ role: "player", name: p.full_name.trim(), email: own });
  return { id: p.id, first_name: p.full_name.trim().split(/\s+/)[0] ?? "", name: p.full_name.trim(), contacts };
}

// "Sam", "Sam and Evan", "Sam, Evan and Leo".
export function firstNames(regs: { first_name: string }[]): string {
  const names = [...new Set(regs.map((r) => r.first_name.trim()).filter(Boolean))];
  if (names.length <= 1) return names[0] ?? "your player";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

// {player} in a message becomes the family's players' first names.
export function fillMessage(text: string, regs: { first_name: string }[]): string {
  return text.replace(/\{player\}/gi, firstNames(regs));
}

// Where a new email from the Directory starts: a hello and the club's name,
// with room between them to write.
export const FAMILY_MESSAGE = `Hi,



Omaha Lightning Basketball`;

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// Plain text as email HTML: blank lines start paragraphs, single line
// breaks stay.
export function messageHtml(text: string): string {
  return text
    .trim()
    .split(/\n\s*\n/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

// Opens the sender's own email app, addressed to the family.
export function mailtoHref(emails: string[], subject: string): string {
  return `mailto:${emails.map(encodeURIComponent).join(",")}?subject=${encodeURIComponent(subject)}`;
}
