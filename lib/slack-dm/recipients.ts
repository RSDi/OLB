// Slack DMs to families from the Directory (0118): who gets one, and what
// it says. Unlike an email, which goes once to each family, a DM goes to
// each person on their own: Dad and Mom get one each. A parent of brothers
// and sisters gets one between them, naming every one of their players.
// Plain module, safe for client and server, and pure, so tests can run it.

import { ALL_RECIPIENTS, firstNames, type MailTarget, type Recipient } from "../teams/family-mail.ts"; // explicit extension so node --test can load this file

// The most people one send can reach: a team, an age group, or who's
// missing a requirement fits; the whole club is a job for email.
export const MAX_DMS = 150;

// The longest message: Slack takes far more, but a DM to a family is short.
export const DM_MAX = 4000;

// Where a new DM starts.
export const DM_MESSAGE = `Hi {name},

`;

export interface DmPerson {
  email: string;
  // Their name on the roster ("Sarah Carter"), or the role word when it
  // has none.
  name: string;
  // Dad, Mom, Guardian, Player: every way they're on the list.
  roles: Recipient[];
  // The players they're messaged about.
  players: MailTarget[];
}

// Everyone with an email among the people picked, once each, in the order
// the players come. Players with nobody to message are listed apart.
export function dmPeople(
  targets: MailTarget[],
  roles: Recipient[] = ALL_RECIPIENTS
): { people: DmPerson[]; noContact: MailTarget[] } {
  const byEmail = new Map<string, DmPerson>();
  const noContact: MailTarget[] = [];
  for (const t of targets) {
    const picked = t.contacts.filter((c) => roles.includes(c.role));
    if (picked.length === 0) {
      noContact.push(t);
      continue;
    }
    for (const c of picked) {
      const person = byEmail.get(c.email);
      if (!person) {
        byEmail.set(c.email, { email: c.email, name: c.name, roles: [c.role], players: [t] });
        continue;
      }
      if (!person.roles.includes(c.role)) person.roles.push(c.role);
      if (!person.players.some((p) => p.id === t.id)) person.players.push(t);
    }
  }
  return { people: [...byEmail.values()], noContact };
}

const ROLE_WORDS = new Set(["dad", "mom", "guardian"]);

// The first name to greet them by. Empty when the roster only knows them as
// "Dad" or "Mom".
export function greetingName(person: Pick<DmPerson, "name">): string {
  const first = person.name.trim().split(/\s+/)[0] ?? "";
  return ROLE_WORDS.has(first.toLowerCase()) ? "" : first;
}

// {name} becomes the person's first name ("there" when there isn't one, so
// "Hi {name}," still reads), and {player} their players' first names.
export function fillDm(text: string, person: { name: string; players: { first_name: string }[] }): string {
  const name = greetingName(person) || "there";
  return text.replace(/\{name\}/gi, name).replace(/\{player\}/gi, firstNames(person.players));
}

// Slack reads &, < and > as markup: escaped, the message arrives as typed.
export function slackText(text: string): string {
  return text.trim().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// "Dad", "Mom & Player".
export const ROLE_WORD: Record<Recipient, string> = { father: "Dad", mother: "Mom", guardian: "Guardian", player: "Player" };

export function roleWords(roles: Recipient[]): string {
  return ALL_RECIPIENTS.filter((r) => roles.includes(r)).map((r) => ROLE_WORD[r]).join(" & ");
}

// A path inside the portal to come back to after connecting Slack. Anything
// else (another site, a protocol-relative "//host") goes to the Directory.
export function safeReturnPath(raw: string | null | undefined): string {
  const v = raw?.trim() ?? "";
  if (!/^\/portal(\/|$|\?)/.test(v) || v.startsWith("//") || v.includes("\\")) return "/portal/directory";
  return v.slice(0, 500);
}

// How "Connect Slack" went, as the pop-up (or ?slack= on the page) says it.
export const CONNECT_OUTCOMES: Record<string, string> = {
  connected: "Slack is connected. Your DMs will come from you.",
  cancelled: "Slack wasn't connected: you cancelled on Slack's page.",
  failed: "Slack couldn't be connected. Try again, or ask a super-admin.",
  "wrong-workspace": "That's a different Slack workspace. Connect the club's Slack.",
  preview: "Slack can't be connected during Preview as.",
  "not-allowed": "You don't have the Slack DMs permission.",
  "not-set-up": "Slack DMs aren't set up on this site yet.",
};

// "Connect Slack" in a pop-up comes back to this instead of a page, and
// closes, so the page underneath keeps what you were doing.
export const POPUP_RETURN = "popup";
