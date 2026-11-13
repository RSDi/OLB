import type { Metadata } from "next";
import Image from "next/image";
import { createClient } from "@supabase/supabase-js";
import { portalFontVariables } from "../../portal/fonts";
import bolt from "../../(site)/_images/logo-bolt.png";
import { CORY_KEY, parseCoryCount } from "../../../lib/fun/cory";
import s from "./exclamation.module.css";

export const metadata: Metadata = {
  title: { absolute: "Coach Cory ! — Omaha Lightning Basketball" },
  description: "How many exclamation points Coach Cory has used in Slack.",
};

// Always the count as it stands.
export const dynamic = "force-dynamic";

async function loadCount(): Promise<number | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    const { data, error } = await createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
      .from("site_content")
      .select("value")
      .eq("key", CORY_KEY)
      .maybeSingle();
    if (error) return null;
    return parseCoryCount((data as { value: string } | null)?.value);
  } catch {
    return null;
  }
}

// The Coach Cory exclamation counter, at /! (a rewrite in next.config.ts) and
// /exclamation. Just the number, in black and gold.
export default async function ExclamationPage() {
  const count = await loadCount();
  return (
    <main className={`${s.page} ${portalFontVariables}`}>
      <div className={s.inner}>
        <Image src={bolt} alt="Omaha Lightning" className={s.bolt} priority sizes="72px" />
        <div className={s.eyebrow}>Coach Cory exclamation points</div>
        <div className={s.count} aria-live="polite">
          {count === null ? "—" : count.toLocaleString("en-US")}
          <span className={s.bang}>!</span>
        </div>
        <div className={s.caption}>and counting in Slack</div>
      </div>
    </main>
  );
}
