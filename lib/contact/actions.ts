"use server";

import { sendContactMessageEmail } from "../notifications/contact-message";
import {
  CLUB_EMAIL,
  contactMessageProblem,
  contactRecipient,
  readContactMessage,
  type ContactMessage,
} from "./message";

export type ContactFormState =
  | { status: "idle" }
  | { status: "sent" }
  | { status: "error"; message: string; values: ContactMessage };

export async function sendContactMessage(
  _prev: ContactFormState,
  form: FormData,
): Promise<ContactFormState> {
  // Bots fill in every field, including the hidden one people never see.
  // Let them think it worked.
  if (String(form.get("website") ?? "")) return { status: "sent" };

  const values = readContactMessage(form);
  const problem = contactMessageProblem(values);
  if (problem) return { status: "error", message: problem, values };

  if (!(await sendContactMessageEmail(values, contactRecipient()))) {
    return {
      status: "error",
      message: `Your message couldn't be sent. Please email us at ${CLUB_EMAIL}.`,
      values,
    };
  }
  return { status: "sent" };
}
