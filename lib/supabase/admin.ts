// Server-only Supabase client using the service role key.
// BYPASSES ROW LEVEL SECURITY. Never import from a "use client" file
// or expose the key to the browser. Used for privileged operations like
// bootstrapping the first admin and sending notifications.

import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. " +
        "The service role key must be set in .env.local for admin operations."
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
