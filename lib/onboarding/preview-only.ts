// Routes that must stay off the production site. Preview and local builds
// can open them; a production build (VERCEL_ENV=production) cannot. Vercel
// inlines VERCEL_ENV at build time, so a production deploy 404s even if
// someone types the path. Pure, safe for client and server.

export function isPreviewDeployment(env: Record<string, string | undefined> = process.env): boolean {
  return env.VERCEL_ENV !== "production";
}
