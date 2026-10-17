// AES-256-GCM for the YouTube refresh token. The key never leaves the
// server (FILM_YOUTUBE_TOKEN_KEY). Ciphertext is stored in Postgres.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PREFIX = "v1";

export function youtubeTokenKey(env: Record<string, string | undefined> = process.env): Buffer {
  const raw = (env.FILM_YOUTUBE_TOKEN_KEY ?? "").trim();
  if (!raw) {
    throw new Error("FILM_YOUTUBE_TOKEN_KEY is not set (32-byte hex or base64 key).");
  }
  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, "hex");
  const b64 = Buffer.from(raw, "base64");
  if (b64.length === 32) return b64;
  throw new Error("FILM_YOUTUBE_TOKEN_KEY must be 32 bytes (64 hex chars or base64).");
}

export function encryptSecret(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
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
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

export function fingerprintKey(key: Buffer): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 8);
}
