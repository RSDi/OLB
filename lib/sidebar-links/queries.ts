// The custom sidebar links (Settings → Sidebar Links), once per request. The
// portal layout hands them to the sidebar. RLS returns nothing to accounts
// that aren't approved; an error (e.g. before migration 0097 is applied)
// just means no extra links.

import { cache } from "react";
import { createClient } from "../supabase/server";
import type { SidebarLink } from "./url";

export const getSidebarLinks = cache(async (): Promise<SidebarLink[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sidebar_links")
    .select("id, label, url, open_in_new_tab, sort_order")
    .order("sort_order")
    .order("label");
  if (error) return [];
  return (data as SidebarLink[]) ?? [];
});
