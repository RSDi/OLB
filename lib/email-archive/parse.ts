// Validate the JSON an agent POSTs to /api/agent/email-archive. Pure.

import { isGmailThreadId } from "./format.ts";
import { sanitizeEmailHtml } from "./sanitize.ts";

export const MAX_MESSAGES = 50;
export const MAX_BODY_CHARS = 200_000;
export const MAX_ATTACHMENTS = 20;
export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
export const MAX_FILENAME = 260;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export type ParsedAttachment = {
  filename: string;
  mime: string;
  sizeBytes: number;
  bytes: Buffer | null;
};

export type ParsedMessage = {
  gmailMessageId: string;
  from: string;
  to: string[];
  cc: string[];
  sentAt: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  snippet: string;
  attachments: ParsedAttachment[];
};

export type ParsedLink = {
  planningMeetingId: string | null;
  month: string | null;
  agendaItemLabel: string;
};

export type ParsedEmailImport = {
  gmailThreadId: string;
  sourceMailbox: string;
  addedBy: string | null;
  subject: string;
  participants: string[];
  messages: ParsedMessage[];
  links: ParsedLink[];
};

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asStringList(v: unknown): string[] {
  if (typeof v === "string" && v.trim()) return [v.trim()];
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean);
}

function decodeBase64(raw: unknown): { ok: true; bytes: Buffer } | { ok: false; error: string } {
  if (typeof raw !== "string" || !raw) return { ok: false, error: "Attachment is missing its file bytes." };
  try {
    const bytes = Buffer.from(raw, "base64");
    if (bytes.length === 0) return { ok: false, error: "Attachment bytes were empty." };
    return { ok: true, bytes };
  } catch {
    return { ok: false, error: "Attachment bytes were not valid base64." };
  }
}

function parseAttachment(raw: unknown, index: number): { ok: true; attachment: ParsedAttachment } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: `Attachment ${index + 1} is not an object.` };
  const row = raw as Record<string, unknown>;
  const filename = asString(row.filename).trim() || asString(row.name).trim();
  if (!filename) return { ok: false, error: `Attachment ${index + 1} needs a filename.` };
  if (filename.length > MAX_FILENAME) return { ok: false, error: `Attachment ${index + 1} filename is too long.` };
  if (filename.includes("/") || filename.includes("\\") || filename.includes("..")) {
    return { ok: false, error: `Attachment ${index + 1} filename isn't allowed.` };
  }
  const mime = asString(row.mime || row.contentType || row.mimeType).trim() || "application/octet-stream";
  let bytes: Buffer | null = null;
  if (row.contentBase64 != null || row.bytesBase64 != null) {
    const decoded = decodeBase64(row.contentBase64 ?? row.bytesBase64);
    if (!decoded.ok) return decoded;
    bytes = decoded.bytes;
  }
  const sizeBytes = typeof row.size === "number" ? row.size : typeof row.sizeBytes === "number" ? row.sizeBytes : bytes?.length ?? 0;
  if (sizeBytes > MAX_ATTACHMENT_BYTES || (bytes && bytes.length > MAX_ATTACHMENT_BYTES)) {
    return { ok: false, error: `Attachment ${index + 1} is larger than 15 MB.` };
  }
  return { ok: true, attachment: { filename, mime, sizeBytes: bytes?.length ?? sizeBytes, bytes } };
}

function parseMessage(raw: unknown, index: number): { ok: true; message: ParsedMessage } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: `Message ${index + 1} is not an object.` };
  const row = raw as Record<string, unknown>;
  const gmailMessageId = asString(row.gmailMessageId || row.id).trim();
  if (!isGmailThreadId(gmailMessageId)) {
    return { ok: false, error: `Message ${index + 1} needs a Gmail message id.` };
  }
  const sentAt = asString(row.sentAt || row.date).trim();
  if (!sentAt || Number.isNaN(Date.parse(sentAt))) {
    return { ok: false, error: `Message ${index + 1} needs a sentAt timestamp.` };
  }
  const bodyText = asString(row.bodyText || row.text);
  const bodyHtml = sanitizeEmailHtml(asString(row.bodyHtml || row.html));
  if (bodyText.length > MAX_BODY_CHARS || bodyHtml.length > MAX_BODY_CHARS) {
    return { ok: false, error: `Message ${index + 1} body is too long.` };
  }
  const attachmentsRaw = Array.isArray(row.attachments) ? row.attachments : [];
  if (attachmentsRaw.length > MAX_ATTACHMENTS) {
    return { ok: false, error: `Message ${index + 1} has too many attachments (max ${MAX_ATTACHMENTS}).` };
  }
  const attachments: ParsedAttachment[] = [];
  for (let i = 0; i < attachmentsRaw.length; i++) {
    const att = parseAttachment(attachmentsRaw[i], i);
    if (!att.ok) return att;
    attachments.push(att.attachment);
  }
  const from = asString(row.from || row.fromAddr).trim();
  const snippet = asString(row.snippet).trim() || bodyText.replace(/\s+/g, " ").slice(0, 240);
  return {
    ok: true,
    message: {
      gmailMessageId,
      from,
      to: asStringList(row.to ?? row.toAddrs),
      cc: asStringList(row.cc ?? row.ccAddrs),
      sentAt: new Date(sentAt).toISOString(),
      subject: asString(row.subject).trim(),
      bodyText,
      bodyHtml,
      snippet,
      attachments,
    },
  };
}

function parseLink(raw: unknown, index: number): { ok: true; link: ParsedLink } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: `Link ${index + 1} is not an object.` };
  const row = raw as Record<string, unknown>;
  const planningMeetingId = asString(row.planningMeetingId || row.meetingId).trim();
  const month = asString(row.month).trim();
  if (planningMeetingId && !UUID_RE.test(planningMeetingId)) {
    return { ok: false, error: `Link ${index + 1} has a bad planningMeetingId.` };
  }
  if (month && !MONTH_RE.test(month)) {
    return { ok: false, error: `Link ${index + 1} month must be YYYY-MM.` };
  }
  if (!planningMeetingId && !month) {
    return { ok: false, error: `Link ${index + 1} needs a planningMeetingId or month.` };
  }
  return {
    ok: true,
    link: {
      planningMeetingId: planningMeetingId || null,
      month: month || null,
      agendaItemLabel: asString(row.agendaItemLabel || row.label).trim().slice(0, 200),
    },
  };
}

export function parseEmailArchiveImport(raw: unknown): { ok: true; value: ParsedEmailImport } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Send a JSON object." };
  const body = raw as Record<string, unknown>;
  const gmailThreadId = asString(body.gmailThreadId || body.threadId).trim();
  if (!isGmailThreadId(gmailThreadId)) return { ok: false, error: "gmailThreadId is required." };
  const sourceMailbox = asString(body.sourceMailbox || body.mailbox).trim();
  if (!sourceMailbox) return { ok: false, error: "sourceMailbox is required (which Gmail this came from)." };
  const messagesRaw = Array.isArray(body.messages) ? body.messages : [];
  if (messagesRaw.length === 0) return { ok: false, error: "messages must list at least one email." };
  if (messagesRaw.length > MAX_MESSAGES) return { ok: false, error: `At most ${MAX_MESSAGES} messages per thread.` };
  const messages: ParsedMessage[] = [];
  for (let i = 0; i < messagesRaw.length; i++) {
    const msg = parseMessage(messagesRaw[i], i);
    if (!msg.ok) return msg;
    messages.push(msg.message);
  }
  messages.sort((a, b) => a.sentAt.localeCompare(b.sentAt));
  const linksRaw = Array.isArray(body.links) ? body.links : [];
  const links: ParsedLink[] = [];
  for (let i = 0; i < linksRaw.length; i++) {
    const link = parseLink(linksRaw[i], i);
    if (!link.ok) return link;
    links.push(link.link);
  }
  const participants = asStringList(body.participants);
  if (participants.length === 0) {
    const seen = new Set<string>();
    for (const m of messages) {
      for (const p of [m.from, ...m.to, ...m.cc]) {
        if (p && !seen.has(p)) {
          seen.add(p);
          participants.push(p);
        }
      }
    }
  }
  const addedBy = asString(body.addedBy).trim() || null;
  const subject = asString(body.subject).trim() || messages[0]?.subject || "(no subject)";
  return {
    ok: true,
    value: {
      gmailThreadId,
      sourceMailbox,
      addedBy,
      subject,
      participants,
      messages,
      links,
    },
  };
}

export function importResponseBody(input: {
  gmailThreadId: string;
  url: string;
  messageCount: number;
  created: boolean;
  warnings: string[];
}): { thread: { gmailThreadId: string; url: string; messageCount: number }; created: boolean; warnings: string[] } {
  return {
    thread: {
      gmailThreadId: input.gmailThreadId,
      url: input.url,
      messageCount: input.messageCount,
    },
    created: input.created,
    warnings: input.warnings,
  };
}
