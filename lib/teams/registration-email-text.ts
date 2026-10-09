// The words in the registration emails that Settings → Registration Emails
// can change (0127): the receipt a family gets when they register, and the
// 6-digit code email. Each field has its original wording here; a saved
// change replaces it, and Reset to original deletes the change. The layout,
// the players and fees, and the payment instructions stay built in.
// Plain module, pure, safe for client and server.

export type RegistrationEmail = "receipt" | "code";

export interface EmailField {
  key: string;
  email: RegistrationEmail;
  label: string;
  help: string;
  original: string;
  multiline: boolean;
  max: number;
}

export const REGISTRATION_EMAILS: { key: RegistrationEmail; label: string; desc: string }[] = [
  { key: "receipt", label: "Registration receipt", desc: "Sent to whoever filled in the form, as soon as they send it." },
  { key: "code", label: "Email code", desc: "The 6-digit code the form emails before it fills in a returning family's details." },
];

export const REGISTRATION_EMAIL_FIELDS: EmailField[] = [
  {
    key: "receipt.subject",
    email: "receipt",
    label: "Subject",
    help: "{player} becomes the players' first names, {season} the season.",
    original: "You're registered: {player} for the {season} season",
    multiline: false,
    max: 200,
  },
  { key: "receipt.headline", email: "receipt", label: "Headline", help: "The big line at the top.", original: "You're registered!", multiline: false, max: 80 },
  {
    key: "receipt.intro",
    email: "receipt",
    label: "Opening",
    help: "{parent} becomes the first name of whoever registered, {player} the players' first names.",
    original:
      "Hi {parent}, thanks for registering {player} with Omaha Lightning Basketball. We've got everything we need, and a coach will be in touch about team placement.",
    multiline: true,
    max: 1000,
  },
  {
    key: "receipt.uniform_note",
    email: "receipt",
    label: "Note under the fees",
    help: "Leave it empty to leave the note off.",
    original: "Uniform sizes and costs come separately, once teams are set.",
    multiline: false,
    max: 300,
  },
  {
    key: "receipt.next_steps",
    email: "receipt",
    label: "What happens next",
    help: "One step per line; they're numbered for you. {teams} becomes \"a team\" or \"teams\".",
    original:
      "The club reviews your registration and places {player} on {teams}.\nA board member will contact you with instructions for joining our team communication platform, Slack.",
    multiline: true,
    max: 1500,
  },
  {
    key: "receipt.closing",
    email: "receipt",
    label: "Sign-off",
    help: "The last line is in bold.",
    original: "Questions? Just reply to this email.\nGo Lightning!",
    multiline: true,
    max: 500,
  },
  {
    key: "code.subject",
    email: "code",
    label: "Subject",
    help: "{code} becomes the 6-digit code.",
    original: "{code} is your Omaha Lightning registration code",
    multiline: false,
    max: 200,
  },
  { key: "code.intro", email: "code", label: "Above the code", help: "", original: "Here's your code for Omaha Lightning Basketball registration:", multiline: true, max: 500 },
  { key: "code.after", email: "code", label: "Below the code", help: "", original: "Type it into the registration form. It works for 10 minutes.", multiline: true, max: 500 },
  {
    key: "code.footnote",
    email: "code",
    label: "Small print",
    help: "",
    original: "Didn't ask for this? You can ignore this email. Nobody can see your family's details without the code.",
    multiline: true,
    max: 500,
  },
];

export type EmailText = Record<string, string>;

export function findEmailField(key: string): EmailField | undefined {
  return REGISTRATION_EMAIL_FIELDS.find((f) => f.key === key);
}

// Every field's words: the saved change where there is one, else the original.
export function emailText(saved: Record<string, string> = {}): EmailText {
  return Object.fromEntries(REGISTRATION_EMAIL_FIELDS.map((f) => [f.key, f.key in saved ? saved[f.key] : f.original]));
}

// {player}, {parent} and friends filled in. An empty {parent} leaves no gap
// ("Hi {parent}," → "Hi,").
export function fillTokens(text: string, vars: Record<string, string>): string {
  return text
    .replace(/\{(\w+)\}/g, (whole, name: string) => (name.toLowerCase() in vars ? vars[name.toLowerCase()] : whole))
    .replace(/[ \t]+([,.!?])/g, "$1");
}

// What a save keeps: trimmed, within the field's limit. Null: back to the
// original (the same words, or an empty field that can't be empty).
export function cleanEmailText(key: string, value: string): { value: string | null } | { error: string } {
  const field = findEmailField(key);
  if (!field) return { error: "That isn't one of the registration emails' words." };
  const v = (value ?? "").replace(/\r\n/g, "\n").trim();
  if (v.length > field.max) return { error: `Keep ${field.label.toLowerCase()} to ${field.max} characters.` };
  if (v === field.original) return { value: null };
  if (!v && field.key !== "receipt.uniform_note") return { error: `${field.label} can't be empty. Reset to original to put the original back.` };
  return { value: v };
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// The code email, for sending and for the preview in Settings.
export function codeEmail(code: string, t: EmailText = emailText()): { subject: string; html: string; text: string } {
  const fill = (s: string) => fillTokens(s, { code });
  const para = (s: string, style = "") => (s.trim() ? `<p${style ? ` style="${style}"` : ""}>${esc(fill(s)).replace(/\n/g, "<br>")}</p>` : "");
  return {
    subject: fill(t["code.subject"]),
    html: `
    ${para(t["code.intro"])}
    <p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:16px 0">${esc(code)}</p>
    ${para(t["code.after"])}
    ${para(t["code.footnote"], "color:#6b7280")}
  `,
    text: [fill(t["code.intro"]), code, fill(t["code.after"])].filter((s) => s.trim()).join("\n"),
  };
}
