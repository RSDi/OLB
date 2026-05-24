// Server-only. Reads the ADMIN_EMAILS env var (comma-separated) and returns
// the normalized allowlist used to bootstrap admin members on first sign-in.
// Never imported from a "use client" file.

export function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getAdminEmails().includes(email.toLowerCase());
}
