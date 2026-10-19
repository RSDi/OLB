// Public origin for invoice links in email. Preview/dev must not use the
// production URL (Vercel sets VERCEL_PROJECT_PRODUCTION_URL on every env).

function host(raw: string | undefined): string {
  const t = raw?.trim();
  if (!t) return "";
  return t.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export function invoicePublicBaseUrl(env: Record<string, string | undefined> = process.env): string {
  if (env.VERCEL_ENV && env.VERCEL_ENV !== "production") {
    const preview = host(env.VERCEL_BRANCH_URL) || host(env.VERCEL_URL);
    if (preview) return `https://${preview}`;
  }
  const site = env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (site) return site;
  const prod = host(env.VERCEL_PROJECT_PRODUCTION_URL) || host(env.VERCEL_URL);
  if (prod) return `https://${prod}`;
  return "http://localhost:3000";
}
