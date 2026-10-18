// Display helpers for archived email. Pure; safe for node --test.

import { CHURCH_TZ } from "../dates/today.ts";

const GMAIL_THREAD_RE = /^[a-zA-Z0-9]+$/;

export function isGmailThreadId(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const id = raw.trim();
  return id.length >= 6 && id.length <= 128 && GMAIL_THREAD_RE.test(id);
}

export function displayNameFromAddr(from: string): string {
  const s = from.trim();
  if (!s) return "Unknown";
  const angle = s.match(/^(.*?)\s*<[^>]+>\s*$/);
  if (angle && angle[1].trim()) return angle[1].trim().replace(/^["']|["']$/g, "");
  const at = s.indexOf("@");
  if (at > 0) return s.slice(0, at);
  return s;
}

export function formatEmailWhen(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const sameYear = d.toLocaleString("en-US", { year: "numeric", timeZone: CHURCH_TZ })
    === now.toLocaleString("en-US", { year: "numeric", timeZone: CHURCH_TZ });
  return d.toLocaleString("en-US", {
    timeZone: CHURCH_TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export function formatEmailWhenLong(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    timeZone: CHURCH_TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export function formatArchivedOn(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `Archived ${d.toLocaleString("en-US", { timeZone: CHURCH_TZ, month: "short", day: "numeric" })}`;
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function participantsLabel(participants: string[]): string {
  if (participants.length === 0) return "";
  if (participants.length === 1) return displayNameFromAddr(participants[0]);
  return `${displayNameFromAddr(participants[0])} → ${displayNameFromAddr(participants[participants.length - 1])}`;
}
