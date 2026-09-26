// The public site's contact form: field shape and validation. Pure so it can
// be unit tested and shared by the form and its server action.

// The club's inbox, shown on the Contact page and the default recipient.
export const CLUB_EMAIL = "LightningBasketballOmaha@gmail.com";

// Where form messages go: CONTACT_EMAIL when set (and not blank), else the
// club's inbox.
export function contactRecipient(env: Record<string, string | undefined> = process.env): string {
  return env.CONTACT_EMAIL?.trim() || CLUB_EMAIL;
}

export type ContactMessage = {
  fname: string;
  lname: string;
  email: string;
  message: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function readContactMessage(form: FormData): ContactMessage {
  const field = (name: string) => String(form.get(name) ?? "").trim();
  return {
    fname: field("fname"),
    lname: field("lname"),
    email: field("email"),
    message: field("message"),
  };
}

// Returns what's wrong, or null when the message can be sent.
export function contactMessageProblem(m: ContactMessage): string | null {
  if (!m.fname || !m.lname || !m.email || !m.message) {
    return "Please fill in all required fields.";
  }
  if (!EMAIL_RE.test(m.email)) {
    return "Please enter a valid email address.";
  }
  if (m.message.length > 10_000) {
    return "Please keep your message under 10,000 characters.";
  }
  return null;
}
