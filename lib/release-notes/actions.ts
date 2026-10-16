"use server";

// The user's "seen up to" release version, stored on members.releases_seen_version
// (0138). Release notes themselves live in code (lib/release-notes/releases.ts).

import { createClient } from "../supabase/server";
import { getAuthUser } from "../auth/viewer";

export async function loadReleasesSeen(): Promise<string | null> {
  const user = await getAuthUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("members")
    .select("releases_seen_version")
    .eq("user_id", user.id)
    .maybeSingle();
  const v = (data as { releases_seen_version?: string | null } | null)?.releases_seen_version;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export async function saveReleasesSeen(version: string): Promise<{ error?: string }> {
  const user = await getAuthUser();
  if (!user) return { error: "You must be signed in." };
  const v = version.trim();
  if (!v) return { error: "Missing version." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("members")
    .update({ releases_seen_version: v })
    .eq("user_id", user.id);
  if (error) return { error: error.message };
  return {};
}
