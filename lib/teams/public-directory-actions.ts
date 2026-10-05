"use server";

// Settings → Public Directory: the key in the public Directory's link
// (/directory/<key>, migration 0119). Super-admins only. The table has no
// RLS policies, so these go through the service role after the check.

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "../auth/guards";
import { createAdminClient } from "../supabase/admin";
import { loadNames } from "./registration-data";
import { keyProblem, randomKey } from "./public-directory-key";

export interface PublicDirectorySetting {
  key: string | null;
  updated_at: string | null;
  updated_by_name: string | null;
}

export async function loadPublicDirectorySetting(): Promise<PublicDirectorySetting | { error: string }> {
  const gate = await requireSuperAdmin();
  if ("error" in gate) return { error: gate.error };
  const { data, error } = await createAdminClient()
    .from("public_directory_link")
    .select("key, updated_by, updated_at")
    .maybeSingle();
  if (error) return { error: "The public Directory isn't set up yet (migration 0119)." };
  const row = data as { key: string | null; updated_by: string | null; updated_at: string } | null;
  const names = row?.updated_by ? await loadNames([row.updated_by]) : null;
  return {
    key: row?.key ?? null,
    updated_at: row?.updated_at ?? null,
    updated_by_name: row?.updated_by ? names?.get(row.updated_by) ?? null : null,
  };
}

async function save(key: string | null): Promise<{ key: string | null } | { error: string }> {
  const gate = await requireSuperAdmin();
  if ("error" in gate) return { error: gate.error };
  if (key !== null) {
    const problem = keyProblem(key);
    if (problem) return { error: problem };
  }
  const { error } = await createAdminClient()
    .from("public_directory_link")
    .upsert({ id: true, key, updated_by: gate.userId, updated_at: new Date().toISOString() });
  if (error) return { error: "Couldn't save the link. Try again." };
  revalidatePath("/portal/settings");
  return { key };
}

// A key typed in by hand.
export async function savePublicDirectoryKey(key: string) {
  return save(key.trim());
}

// A fresh random key, retiring the old link.
export async function newPublicDirectoryKey() {
  return save(randomKey());
}

// Turns the page off: every link stops working until a new key is saved.
export async function turnOffPublicDirectory() {
  return save(null);
}
