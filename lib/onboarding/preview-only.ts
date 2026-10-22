// Routes that must stay off the production site. Preview and local builds
// can open them; a production build (VERCEL_ENV=production) cannot. Vercel
// inlines VERCEL_ENV at build time, so a production deploy 404s even if
// someone types the path. Pure, safe for client and server.

export const PRODUCTION_WRITE_BLOCKED =
  "This assessment form isn't open on the public website. Use the preview link to sign up.";

export function isPreviewDeployment(env: Record<string, string | undefined> = process.env): boolean {
  return env.VERCEL_ENV !== "production";
}

export function previewWriteBlocked(env: Record<string, string | undefined> = process.env): string | null {
  return isPreviewDeployment(env) ? null : PRODUCTION_WRITE_BLOCKED;
}
