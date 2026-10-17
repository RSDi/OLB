// Browser-safe TUS helpers for the signed-upload path.
// Keep this file free of server-only imports (admin client, service role).
//
// `/storage/v1/upload/resumable` requires a compact-JWS Authorization bearer
// (user session or the legacy JWT anon key). Guests are not signed in, and
// `NEXT_PUBLIC_SUPABASE_ANON_KEY` may be the new `sb_publishable_…` format,
// which is not a JWT — that is the "Invalid Compact JWS" failure.
//
// `/storage/v1/upload/resumable/sign` skips JWT auth and checks `x-signature`
// against the token from createSignedUploadUrl (minted server-side).

export function tusEndpoint(supabaseUrl: string): string {
  const raw = supabaseUrl.replace(/\/+$/, "");
  try {
    const u = new URL(raw);
    const host = /\.storage\.supabase\.co$/i.test(u.hostname)
      ? u.hostname
      : u.hostname.replace(/\.supabase\.co$/i, ".storage.supabase.co");
    return `${u.protocol}//${host}/storage/v1/upload/resumable/sign`;
  } catch {
    return `${raw}/storage/v1/upload/resumable/sign`;
  }
}

export function tusSignedHeaders(token: string): Record<string, string> {
  const signature = token.trim();
  const headers: Record<string, string> = { "x-upsert": "false" };
  if (signature) headers["x-signature"] = signature;
  return headers;
}
