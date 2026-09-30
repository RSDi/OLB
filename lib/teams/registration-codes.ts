// The 6-digit codes the public registration form emails to check an address
// (0103). Server-only: node's crypto. Only a hash is stored, salted with the
// row's id, so a leaked table can't be replayed.

import { createHash, randomInt, timingSafeEqual } from "node:crypto";

export const CODE_MINUTES = 10;
export const CODE_TRIES = 5;
export const CODES_PER_HOUR = 5;
// How long a checked email counts as confirmed for the registration it's on.
export const VERIFIED_HOURS = 6;

export function newCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashCode(id: string, code: string): string {
  return createHash("sha256").update(`${id}:${code}`).digest("hex");
}

export interface CodeRow {
  id: string;
  code_hash: string;
  attempts: number;
  expires_at: string;
  verified_at: string | null;
}

export type CodeCheck = "ok" | "wrong" | "expired" | "locked";

// Whether a typed code matches the latest one sent. Digits only, so "123 456"
// and "123-456" still match.
export function checkCode(row: CodeRow | null, typed: string, now = new Date()): CodeCheck {
  if (!row || row.verified_at || new Date(row.expires_at) <= now) return "expired";
  if (row.attempts >= CODE_TRIES) return "locked";
  const digits = typed.replace(/\D/g, "");
  if (digits.length !== 6) return "wrong";
  const a = Buffer.from(hashCode(row.id, digits), "hex");
  const b = Buffer.from(row.code_hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b) ? "ok" : "wrong";
}
