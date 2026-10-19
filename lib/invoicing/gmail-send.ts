// Build an RFC 2822 message and POST it to Gmail users.messages.send.
// Host-only. packages/invoicing never imports this.

import { randomBytes } from "node:crypto";
import { isGmailAuthFailure } from "./gmail-oauth.ts";

export const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

export type GmailSendInput = {
  accessToken: string;
  from: string;
  replyTo: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  text: string;
  html: string;
};

export type GmailSendResult = { ok: boolean; status?: number; error?: string; authFailed?: boolean };

function headerSafe(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

const RFC2047_WORD_MAX = 75;
const RFC2047_PREFIX = "=?UTF-8?B?";
const RFC2047_SUFFIX = "?=";
// 75 - prefix - suffix, then down to a multiple of 4 base64 chars (45 raw bytes).
const RFC2047_BYTES_PER_WORD = 45;

/** RFC 2047 encoded-word(s) for a header phrase. Long values fold per RFC 2047/5322. */
export function encodeRfc2047(value: string): string {
  const clean = headerSafe(value);
  if (/^[\x20-\x7e]*$/.test(clean)) return clean;
  const bytes = Buffer.from(clean, "utf8");
  const words: string[] = [];
  for (let i = 0; i < bytes.length; ) {
    let n = Math.min(RFC2047_BYTES_PER_WORD, bytes.length - i);
    while (n > 0 && i + n < bytes.length && (bytes[i + n]! & 0xc0) === 0x80) n--;
    if (n <= 0) n = Math.min(1, bytes.length - i);
    const word = `${RFC2047_PREFIX}${bytes.subarray(i, i + n).toString("base64")}${RFC2047_SUFFIX}`;
    if (word.length > RFC2047_WORD_MAX) {
      n = Math.max(1, n - 3);
      words.push(`${RFC2047_PREFIX}${bytes.subarray(i, i + n).toString("base64")}${RFC2047_SUFFIX}`);
      i += n;
      continue;
    }
    words.push(word);
    i += n;
  }
  return words.join("\r\n ");
}

function subjectHeader(subject: string): string {
  const encoded = encodeRfc2047(subject);
  if (!encoded.includes("=?")) return `Subject: ${encoded}`;
  const words = encoded.split("\r\n ");
  const inline = `Subject: ${words[0]}`;
  if (words.length === 1 && inline.length <= 78) return inline;
  return `Subject:\r\n ${words.join("\r\n ")}`;
}

function encodeFrom(from: string): string {
  const clean = headerSafe(from);
  const m = clean.match(/^(.*)<([^>]+)>\s*$/);
  if (!m) return encodeRfc2047(clean);
  const name = m[1]!.trim().replace(/^"(.*)"$/, "$1");
  const email = m[2]!.trim();
  if (!name) return email;
  return `${encodeRfc2047(name)} <${email}>`;
}

/** RFC 2822 message, then Gmail's base64url raw field. */
export function buildGmailRawMessage(input: Omit<GmailSendInput, "accessToken">): string {
  const boundary = `inv_${randomBytes(8).toString("hex")}`;
  const headers = [
    `From: ${encodeFrom(input.from)}`,
    `To: ${input.to.map(headerSafe).join(", ")}`,
    input.cc.length ? `Cc: ${input.cc.map(headerSafe).join(", ")}` : null,
    input.bcc.length ? `Bcc: ${input.bcc.map(headerSafe).join(", ")}` : null,
    `Reply-To: ${headerSafe(input.replyTo)}`,
    subjectHeader(input.subject),
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].filter((h): h is string => Boolean(h));

  const body = [
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    input.text,
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    input.html,
    `--${boundary}--`,
    "",
  ].join("\r\n");

  return Buffer.from(`${headers.join("\r\n")}\r\n\r\n${body}`, "utf8").toString("base64url");
}

export async function sendInvoiceViaGmail(input: GmailSendInput): Promise<GmailSendResult> {
  const raw = buildGmailRawMessage(input);
  const res = await fetch(GMAIL_SEND_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${input.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  }).catch(() => null);
  if (!res) return { ok: false, error: "network error", authFailed: false };
  if (res.ok) return { ok: true, status: res.status };
  const errText = await res.text().catch(() => "");
  return {
    ok: false,
    status: res.status,
    error: errText.slice(0, 300),
    authFailed: isGmailAuthFailure(res.status, errText),
  };
}
