// Browser-safe TUS helpers for the signed-upload path.
// Keep this file free of server-only imports (admin client, service role).
//
// Hosted Storage's /upload/resumable/sign authenticates with x-signature
// only (the createSignedUploadUrl token). It is a compact JWS. XMLHttpRequest
// (tus-js-client in Safari) *merges* duplicate setRequestHeader calls with a
// comma, so setting x-signature from both Uppy `headers` and `onBeforeRequest`
// turns a valid token into `token, token` — and Storage returns plain-text
// `Invalid Compact JWS`. Set each header once.

export function isCompactJws(value: string | null | undefined): boolean {
  const raw = (value ?? "").trim();
  if (!raw || raw.startsWith("sb_") || raw.includes(",") || /\s/.test(raw)) return false;
  const parts = raw.split(".");
  return parts.length === 3 && parts.every((p) => p.length > 0);
}

export function tusEndpoint(supabaseUrl: string, useDirectStorageHost = true): string {
  const raw = supabaseUrl.replace(/\/+$/, "");
  const path = "/storage/v1/upload/resumable/sign";
  try {
    const u = new URL(raw);
    if (!useDirectStorageHost) return `${u.protocol}//${u.host}${path}`;
    const host = /\.storage\.supabase\.co$/i.test(u.hostname)
      ? u.hostname
      : u.hostname.replace(/\.supabase\.co$/i, ".storage.supabase.co");
    return `${u.protocol}//${host}${path}`;
  } catch {
    return `${raw}${path}`;
  }
}

export function tusSignedHeaders(token: string): Record<string, string> {
  const signature = token.trim();
  const headers: Record<string, string> = { "x-upsert": "false" };
  if (signature) headers["x-signature"] = signature;
  return headers;
}

export function tusUploadMetadata(fields: {
  bucketName: string;
  objectName: string;
  contentType: string;
  cacheControl?: string;
}): string {
  const pairs: [string, string][] = [
    ["bucketName", fields.bucketName],
    ["objectName", fields.objectName],
    ["contentType", fields.contentType],
    ["cacheControl", fields.cacheControl ?? "3600"],
  ];
  return pairs
    .filter(([, value]) => value)
    .map(([key, value]) => `${key} ${utf8ToBase64(value)}`)
    .join(",");
}

function utf8ToBase64(value: string): string {
  if (typeof Buffer !== "undefined") return Buffer.from(value, "utf8").toString("base64");
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
