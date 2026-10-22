// Routes that must stay off the production site unless they are on
// PRODUCTION_ALLOWED. Preview and local builds can open every feature;
// a production build (VERCEL_ENV=production) cannot, except Assessments.
// Vercel inlines VERCEL_ENV at build time. Pure, safe for client and server.

export const PRODUCTION_WRITE_BLOCKED =
  "This assessment form isn't open on the public website. Use the preview link to sign up.";

/** Production may render and write these features. Every other guarded path stays blocked. */
export const PRODUCTION_ALLOWED = ["assessments"] as const;
export type PreviewGuardFeature = (typeof PRODUCTION_ALLOWED)[number] | "waitlist";

const PRODUCTION_ALLOWED_SET: ReadonlySet<string> = new Set(PRODUCTION_ALLOWED);

export function isPreviewDeployment(env: Record<string, string | undefined> = process.env): boolean {
  return env.VERCEL_ENV !== "production";
}

export function previewRouteOpen(
  feature: PreviewGuardFeature,
  env: Record<string, string | undefined> = process.env,
): boolean {
  return isPreviewDeployment(env) || PRODUCTION_ALLOWED_SET.has(feature);
}

export function previewWriteBlocked(
  feature: PreviewGuardFeature,
  env: Record<string, string | undefined> = process.env,
): string | null {
  return previewRouteOpen(feature, env) ? null : PRODUCTION_WRITE_BLOCKED;
}
