"use server";

// Settings → Sidebar Links. Super-admin only, here and in RLS (migration 0096).

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "../auth/guards";
import { createClient } from "../supabase/server";
import { normalizeSidebarUrl, SIDEBAR_LINK_LABEL_MAX, type SidebarLink } from "./url";

export interface SidebarLinkResult {
  success?: boolean;
  error?: string;
}

export interface SidebarLinkInput {
  label: string;
  url: string;
  openInNewTab: boolean;
}

function clean(input: SidebarLinkInput): { error: string } | { label: string; url: string } {
  const label = input.label.trim();
  if (!label) return { error: "Label is required." };
  if (label.length > SIDEBAR_LINK_LABEL_MAX) {
    return { error: `Keep the label to ${SIDEBAR_LINK_LABEL_MAX} characters or fewer.` };
  }
  const url = normalizeSidebarUrl(input.url);
  if (!url) return { error: "Enter a web address like https://example.com, or a portal page like /portal/docs." };
  return { label, url };
}

// The sidebar is in the portal layout, so refresh every portal page.
function refresh() {
  revalidatePath("/portal", "layout");
}

export async function createSidebarLink(input: SidebarLinkInput): Promise<SidebarLinkResult> {
  const gate = await requireSuperAdmin();
  if ("error" in gate) return { error: gate.error };
  const c = clean(input);
  if ("error" in c) return { error: c.error };

  const supabase = await createClient();
  // New links go to the bottom of the list.
  const { data: last } = await supabase
    .from("sidebar_links")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sortOrder = ((last as { sort_order: number } | null)?.sort_order ?? 0) + 10;

  const { error } = await supabase.from("sidebar_links").insert({
    label: c.label,
    url: c.url,
    open_in_new_tab: input.openInNewTab,
    sort_order: sortOrder,
    created_by: gate.userId,
  });
  if (error) return { error: error.message };
  refresh();
  return { success: true };
}

export async function updateSidebarLink(id: string, input: SidebarLinkInput): Promise<SidebarLinkResult> {
  const gate = await requireSuperAdmin();
  if ("error" in gate) return { error: gate.error };
  const c = clean(input);
  if ("error" in c) return { error: c.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("sidebar_links")
    .update({ label: c.label, url: c.url, open_in_new_tab: input.openInNewTab })
    .eq("id", id);
  if (error) return { error: error.message };
  refresh();
  return { success: true };
}

export async function deleteSidebarLink(id: string): Promise<SidebarLinkResult> {
  const gate = await requireSuperAdmin();
  if ("error" in gate) return { error: gate.error };
  const supabase = await createClient();
  const { error } = await supabase.from("sidebar_links").delete().eq("id", id);
  if (error) return { error: error.message };
  refresh();
  return { success: true };
}

// Swap a link with its neighbour. Renumbers the whole (short) list so ties
// from hand-edited sort orders can't make a move a no-op.
export async function moveSidebarLink(id: string, direction: "up" | "down"): Promise<SidebarLinkResult> {
  const gate = await requireSuperAdmin();
  if ("error" in gate) return { error: gate.error };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sidebar_links")
    .select("id, sort_order, label")
    .order("sort_order")
    .order("label");
  if (error) return { error: error.message };
  const ids = ((data as Pick<SidebarLink, "id">[]) ?? []).map((r) => r.id);
  const i = ids.indexOf(id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ids.length) return { success: true };
  [ids[i], ids[j]] = [ids[j], ids[i]];

  const results = await Promise.all(
    ids.map((linkId, n) =>
      supabase.from("sidebar_links").update({ sort_order: (n + 1) * 10 }).eq("id", linkId)
    )
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return { error: failed.error.message };
  refresh();
  return { success: true };
}
