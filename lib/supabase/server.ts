import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// `changeSource` labels what this client writes in contact history
// (contact_versions, migration 0109): the spreadsheet import, or "Restore
// this version". The x-change-source header reaches the history trigger.
export async function createClient(opts?: { changeSource?: "import" | "restore" }) {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component render — cookies can't be set here
          }
        },
      },
      ...(opts?.changeSource ? { global: { headers: { "x-change-source": opts.changeSource } } } : {}),
    }
  );
}
