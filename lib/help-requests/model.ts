// Ask for help: the rules both sides share (pure, no server or browser
// imports). Ported from Operations' problem reports.

export const HELP_BUCKET = "help-requests";
export const HELP_BODY_MAX = 5000;
const CONTEXT_MAX = 1000;

// One optional screenshot and one optional video per request. Both go
// straight from the browser to storage through a signed link (a Vercel
// function refuses a body over 4.5 MB); the request then names the upload.
export const HELP_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const HELP_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
export const HELP_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
export const HELP_VIDEO_TYPES = ["video/webm", "video/mp4", "video/quicktime"];
/** Record screen stops by itself after this long. */
export const HELP_RECORDING_MAX_MS = 3 * 60_000;

export type HelpUploadKind = "screenshot" | "video";

const RULES: Record<HelpUploadKind, { types: string[]; maxBytes: number; tooBig: string; wrongType: string }> = {
  screenshot: {
    types: HELP_IMAGE_TYPES,
    maxBytes: HELP_IMAGE_MAX_BYTES,
    tooBig: "Keep the image under 5 MB.",
    wrongType: "Attach a PNG, JPEG, WebP or GIF image.",
  },
  video: {
    types: HELP_VIDEO_TYPES,
    maxBytes: HELP_VIDEO_MAX_BYTES,
    tooBig: "Keep the video under 50 MB. That's about 3 minutes of screen recording, or a minute from a phone.",
    wrongType: "Attach an MP4, MOV or WebM video.",
  },
};

/** "video/webm;codecs=vp9,opus" → "video/webm". */
export function baseMime(type: string): string {
  return type.split(";")[0].trim().toLowerCase();
}

/** Checks a file before an upload starts. Errors, not silent drops. */
export function checkHelpUpload(kind: HelpUploadKind, type: string, size: number): string | null {
  const rule = RULES[kind];
  if (!rule.types.includes(baseMime(type))) return rule.wrongType;
  if (!(size > 0)) return "That file is empty.";
  if (size > rule.maxBytes) return rule.tooBig;
  return null;
}

export function helpUploadExt(contentType: string): string {
  const t = baseMime(contentType);
  if (t === "image/png") return "png";
  if (t === "image/webp") return "webp";
  if (t === "image/gif") return "gif";
  if (t === "image/jpeg") return "jpg";
  if (t === "video/webm") return "webm";
  if (t === "video/mp4") return "mp4";
  if (t === "video/quicktime") return "mov";
  return "bin";
}

// <user id>/<screenshot|video>-<uuid>.<ext>: the path starts with the
// asker's own id, so a request can only name a file that person uploaded.
const UPLOAD_PATH = /^([0-9a-f-]{36})\/(screenshot|video)-[0-9a-f-]{36}\.(png|jpg|webp|gif|webm|mp4|mov)$/;

export function isHelpUploadPath(kind: HelpUploadKind, userId: string, path: unknown): path is string {
  if (typeof path !== "string") return false;
  const m = path.match(UPLOAD_PATH);
  return !!m && m[1] === userId && m[2] === kind;
}

function clip(v: unknown): string | null {
  const t = typeof v === "string" ? v.trim() : "";
  return t ? t.slice(0, CONTEXT_MAX) : null;
}

/** Only http(s) addresses are kept: the inbox shows page_url as a link. */
export function safePageUrl(v: unknown): string | null {
  const t = clip(v);
  return t && /^https?:\/\//i.test(t) ? t : null;
}

export function cleanContext(v: unknown): string | null {
  return clip(v);
}

/** A message or reply: trimmed, not empty, not too long. */
export function parseHelpBody(v: unknown): { ok: true; body: string } | { ok: false; error: string } {
  const body = typeof v === "string" ? v.trim() : "";
  if (!body) return { ok: false, error: "Write a message first." };
  if (body.length > HELP_BODY_MAX) {
    return { ok: false, error: `Keep it under ${HELP_BODY_MAX.toLocaleString("en-US")} characters.` };
  }
  return { ok: true, body };
}

// Screen recording: desktop only. Phones have no screen capture for web
// pages, and iOS Safari defines getDisplayMedia but it fails, so phones and
// tablets are ruled out by device.
export function isPhoneOrTablet(ua: string, maxTouchPoints: number): boolean {
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true;
  return /Macintosh/.test(ua) && maxTouchPoints > 1;
}

export const RECORDING_TYPES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4;codecs=avc1,mp4a.40.2",
  "video/mp4",
];

export function pickRecordingType(isSupported: (type: string) => boolean): string {
  return RECORDING_TYPES.find(t => isSupported(t)) ?? "";
}

/** "Chrome · macOS" from a user-agent string, for the inbox. */
export function browserLabel(ua: string | null | undefined): string | null {
  if (!ua) return null;
  const browser = /Edg\//.test(ua) ? "Edge"
    : /OPR\//.test(ua) ? "Opera"
    : /Firefox\//.test(ua) ? "Firefox"
    : /CriOS|Chrome\//.test(ua) ? "Chrome"
    : /Safari\//.test(ua) ? "Safari"
    : null;
  const os = /iPhone|iPad|iPod/.test(ua) ? "iOS"
    : /Android/.test(ua) ? "Android"
    : /Mac OS X|Macintosh/.test(ua) ? "macOS"
    : /Windows/.test(ua) ? "Windows"
    : /Linux/.test(ua) ? "Linux"
    : null;
  const parts = [browser, os].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

export interface HelpMessage {
  id: string;
  fromAsker: boolean;
  authorName: string;
  body: string;
  createdAt: string;
}

export interface HelpRequest {
  id: string;
  askerName: string;
  askerEmail: string | null;
  body: string;
  pageUrl: string | null;
  pageTitle: string | null;
  browser: string | null;
  screenshotUrl: string | null;
  videoUrl: string | null;
  askerUnread: boolean;
  needsReply: boolean;
  closedAt: string | null;
  closedBy: string | null;
  createdAt: string;
  updatedAt: string;
  messages: HelpMessage[];
}
