// Browser-safe TUS helpers for the signed-upload path.
// Keep this file free of server-only imports (admin client, service role).
//
// Hosted `*.storage.supabase.co` still runs a JWT check on Authorization /
// apikey *before* `/upload/resumable/sign` reads `x-signature`. The new
// `sb_publishable_…` key is not a compact JWS, so sending it (or sending
// nothing) returns "Invalid Compact JWS".
//
// We send a compact-JWS on Authorization + apikey: the legacy anon JWT if
// we have one, otherwise the signed-upload token (itself a JWT). The
// publishable key is never used as a bearer.

export function isCompactJws(value: string | null | undefined): boolean {
  const raw = (value ?? "").trim();
  if (!raw || raw.startsWith("sb_")) return false;
  const parts = raw.split(".");
  return parts.length === 3 && parts.every((p) => p.length > 0);
}

export function filmGatewayJwt(env: Record<string, string | undefined> = process.env): string {
  for (const key of [
    env.NEXT_PUBLIC_SUPABASE_LEGACY_ANON_KEY,
    env.SUPABASE_LEGACY_ANON_KEY,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ]) {
    if (isCompactJws(key)) return key!.trim();
  }
  return "";
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

export function tusSignedHeaders(
  token: string,
  gatewayJwt = ""
): Record<string, string> {
  const signature = token.trim();
  const headers: Record<string, string> = { "x-upsert": "false" };
  if (signature) headers["x-signature"] = signature;
  const jwt = isCompactJws(gatewayJwt) ? gatewayJwt.trim() : isCompactJws(signature) ? signature : "";
  if (jwt) {
    headers.authorization = `Bearer ${jwt}`;
    headers.apikey = jwt;
  }
  return headers;
}
