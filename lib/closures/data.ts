// Server-side reads for the public /not-here page. Anon RLS (0083) already
// restricts the query to the open closure; the date window is applied here in
// church-local time so auto-expiry happens at request time without a cron.

import { createClient } from "../supabase/server";
import { churchToday } from "../dates/today";

export interface ActiveClosure {
  id: string;
  title: string;
  body_md: string;
  starts_on: string;
  ends_on: string | null;
}

export async function getActiveClosure(): Promise<ActiveClosure | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("closures")
    .select("id, title, body_md, starts_on, ends_on")
    .is("cleared_at", null)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) return null;

  const closure = data as ActiveClosure;
  const today = churchToday();
  if (closure.starts_on > today) return null;
  if (closure.ends_on && closure.ends_on < today) return null;
  return closure;
}

// The permanent door QR encodes `${siteUrl()}/not-here`, so in production
// NEXT_PUBLIC_SITE_URL must be set — the VERCEL_URL fallback would bake a
// deployment-specific URL into a sign meant to last for years.
export function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}
