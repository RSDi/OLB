// Server-only. Loads the Our Programs hero message for the public page and
// Settings. When olb_homepage_messages isn't applied yet, the box stays
// hidden and Settings shows the seed so it can be edited after the SQL runs.

import { unstable_cache } from "next/cache";
import { createAdminClient } from "../supabase/admin";
import {
  DEFAULT_PROGRAMS_HERO,
  HOMEPAGE_MESSAGE_TAG,
  PROGRAMS_HERO_KEY,
  tableMissing,
  visibleHomepageMessage,
  type HomepageMessage,
  type VisibleHomepageMessage,
} from "./homepage-message";

type Row = {
  key: string;
  enabled: boolean;
  body: string;
  link_text: string;
  link_url: string;
  updated_at: string | null;
  updated_by: string | null;
};

function asMessage(row: Row): HomepageMessage {
  return {
    key: row.key,
    enabled: !!row.enabled,
    body: row.body ?? "",
    link_text: row.link_text ?? "",
    link_url: row.link_url ?? "",
    updated_at: row.updated_at,
    updated_by: row.updated_by,
  };
}

export type HomepageMessageLoad = {
  message: HomepageMessage;
  fromTable: boolean;
};

const loadCachedRow = unstable_cache(
  async (): Promise<Row | null> => {
    const db = createAdminClient();
    const { data, error } = await db
      .from("olb_homepage_messages")
      .select("key, enabled, body, link_text, link_url, updated_at, updated_by")
      .eq("key", PROGRAMS_HERO_KEY)
      .maybeSingle();
    if (error) {
      if (tableMissing(error)) throw new Error("table missing");
      throw new Error(error.message);
    }
    return (data as Row | null) ?? null;
  },
  ["homepage-message-programs-hero"],
  { tags: [HOMEPAGE_MESSAGE_TAG], revalidate: 600 },
);

export async function loadHomepageMessage(): Promise<HomepageMessageLoad> {
  try {
    const row = await loadCachedRow();
    return { message: row ? asMessage(row) : DEFAULT_PROGRAMS_HERO, fromTable: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (tableMissing({ message }) || message === "table missing" || /NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY/.test(message)) {
      return { message: DEFAULT_PROGRAMS_HERO, fromTable: false };
    }
    console.error("[homepage-message] load failed", message);
    return { message: DEFAULT_PROGRAMS_HERO, fromTable: false };
  }
}

export async function getVisibleProgramsHeroMessage(): Promise<VisibleHomepageMessage | null> {
  const { message, fromTable } = await loadHomepageMessage();
  return visibleHomepageMessage(message, fromTable);
}
