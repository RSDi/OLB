// AES-256-GCM for the club Gmail refresh token. The key never leaves the
// server (INVOICE_GMAIL_TOKEN_KEY). Ciphertext is stored in Postgres.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PREFIX = "v1";
const GCM_IV_LENGTH = 12;
const GCM_TAG_LENGTH = 16;

export function invoiceGmailTokenKey(env: Record<string, string | undefined> = process.env): Buffer {
  const raw = (env.INVOICE_GMAIL_TOKEN_KEY ?? "").trim();
  if (!raw) {
    throw new Error("INVOICE_GMAIL_TOKEN_KEY is not set (64 hex characters).");
  }
  if (!/^[0-9a-f]{64}$/i.test(raw)) {
    throw new Error("INVOICE_GMAIL_TOKEN_KEY must be 64 hex characters (32 bytes).");
  }
  return Buffer.from(raw, "hex");
}

export function encryptSecret(plain: string, key: Buffer): string {
  const iv = randomBytes(GCM_IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: GCM_TAG_LENGTH });
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  if (tag.length !== GCM_TAG_LENGTH) throw new Error("That stored token isn't readable.");
  return [PREFIX, iv.toString("base64url"), enc.toString("base64url"), tag.toString("base64url")].join(".");
}

export function decryptSecret(packed: string, key: Buffer): string {
  const parts = packed.split(".");
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    throw new Error("That stored token isn't readable.");
  }
  const iv = Buffer.from(parts[1]!, "base64url");
  const enc = Buffer.from(parts[2]!, "base64url");
  const tag = Buffer.from(parts[3]!, "base64url");
  if (iv.length !== GCM_IV_LENGTH || tag.length !== GCM_TAG_LENGTH) {
    throw new Error("That stored token isn't readable.");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: GCM_TAG_LENGTH });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

export function fingerprintKey(key: Buffer): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 8);
}
