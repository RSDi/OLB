"use server";

// Settings → Sidebar Links. Super-admin only, here and in RLS (migration 0097).

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireSuperAdmin } from "../auth/guards";
import { createClient } from "../supabase/server";
import {
  canOpenInFrame,
  normalizeSidebarUrl,
  refusesFraming,
  SIDEBAR_LINK_LABEL_MAX,
  type SidebarLink,
  type SidebarLinkMode,
} from "./url";

export interface SidebarLinkResult {
  success?: boolean;
  error?: string;
}

export interface SidebarLinkInput {
  label: string;
  url: string;
  mode: SidebarLinkMode;
}

interface CleanLink {
  label: string;
  url: string;
  open_in_new_tab: boolean;
  open_in_frame: boolean;
}

async function clean(input: SidebarLinkInput): Promise<{ error: string } | CleanLink> {
  const label = input.label.trim();
  if (!label) return { error: "Label is required." };
  if (label.length > SIDEBAR_LINK_LABEL_MAX) {
    return { error: `Keep the label to ${SIDEBAR_LINK_LABEL_MAX} characters or fewer.` };
  }
  const url = normalizeSidebarUrl(input.url);
  if (!url) return { error: "Enter a web address like https://example.com, or a portal page like /portal/docs." };
  // A portal page is already inside the portal: "inside the portal" just
  // means the same tab for it.
  const mode = input.mode === "frame" && !canOpenInFrame(url) ? "same_tab" : input.mode;
  if (mode === "frame" && (await siteRefusesFraming(url))) {
    return {
      error:
        "That site doesn't let other sites show it inside a frame, so it can't open inside the portal. Choose \"Open in a new browser tab\" instead.",
    };
  }
  return { label, url, open_in_new_tab: mode === "new_tab", open_in_frame: mode === "frame" };
}

// Asks the site whether it can be framed, so nobody gets a blank page. If the
// site can't be reached right now, give it the benefit of the doubt.
async function siteRefusesFraming(url: string): Promise<boolean> {
  try {
    const ourHost = ((await headers()).get("host") ?? "").replace(/:\d+$/, "");
    const res = await fetch(url, {
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    res.body?.cancel().catch(() => {});
    return refusesFraming(
      {
        xFrameOptions: res.headers.get("x-frame-options"),
        contentSecurityPolicy: res.headers.get("content-security-policy"),
      },
      ourHost
    );
  } catch {
    return false;
  }
}

// The sidebar is in the portal layout, so refresh every portal page.
function refresh() {
  revalidatePath("/portal", "layout");
}

export async function createSidebarLink(input: SidebarLinkInput): Promise<SidebarLinkResult> {
  const gate = await requireSuperAdmin();
  if ("error" in gate) return { error: gate.error };
  const c = await clean(input);
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
    ...c,
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
  const c = await clean(input);
  if ("error" in c) return { error: c.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("sidebar_links")
    .update(c)
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
