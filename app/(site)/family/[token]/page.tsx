import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "../../../components/olb.css";
import s from "../../player-registration/wizard.module.css";
import c from "./checklist.module.css";
import { createAdminClient } from "../../../../lib/supabase/admin";
import { loadSettings } from "../../../../lib/onboarding/server";
import { loadFamilies } from "../../../../lib/onboarding/family-data";
import { openItems } from "../../../../lib/onboarding/checklist";
import { SEASON_LABEL } from "../../../../lib/teams/registration-form";

export const metadata: Metadata = { title: "Your Checklist", robots: { index: false, follow: false } };

// A family's checklist (0130), from the private link in their emails: what's
// done and what's left before the season, worked out fresh each time from
// their registration, Payments, Slack and the season's dates. No account
// needed; the link is the key. Gone while the registration workflow is off.
export default async function FamilyChecklistPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{24,80}$/.test(token)) notFound();
  const db = createAdminClient();
  const { data: fam } = await db.from("olb_onboarding_families").select("id, board_id").eq("token", token).maybeSingle();
  if (!fam) notFound();
  const settings = await loadSettings(db, (fam as { board_id: string }).board_id);
  if (!settings.enabled) notFound();
  const [family] = await loadFamilies(db, settings, { token });
  if (!family) notFound();
  await db.from("olb_onboarding_families").update({ last_seen_at: new Date().toISOString() }).eq("id", family.id);

  const open = openItems(family.items);
  const lastName = family.registrations[0]?.last_name ?? "";
  return (
    <div className="olb-root">
      <div className={s.wrap}>
        <div className={s.top}>
          <span className={s.eyebrow}>
            {lastName ? `${lastName} family · ` : ""}
            {SEASON_LABEL}
          </span>
        </div>
        <div className={s.card}>
          <h2 className={s.question}>
            {open.length === 0 ? `You're all set, ${family.greeting}!` : `You're almost ready, ${family.greeting}`}
          </h2>
          <p className={s.lead}>
            {open.length === 0
              ? `Everything for ${family.playerNames} is done. See you on the court!`
              : `${open.length === 1 ? "One thing" : `${open.length} things`} left for ${family.playerNames}.`}
          </p>
          <ul className={c.list}>
            {family.items.map((i) => (
              <li key={i.key} className={c.item}>
                <span className={`${c.mark} ${i.done ? c.done : i.todo ? c.todo : c.info}`} aria-hidden="true">
                  {i.done ? "✓" : ""}
                </span>
                <span className={c.text}>
                  <strong>{i.label}</strong>
                  {i.detail && <span className={c.detail}>{i.detail}</span>}
                </span>
                {i.link && !i.done ? (
                  <a className={c.action} href={i.link.href} target="_blank" rel="noreferrer">
                    {i.link.label}
                  </a>
                ) : (
                  <span className={c.state}>{i.done ? "Done" : i.todo ? "To do" : ""}</span>
                )}
              </li>
            ))}
          </ul>
          <p className={s.note}>
            This page updates as we hear from you. Questions? Email <strong>lightningbasketballomaha@gmail.com</strong>.
          </p>
        </div>
      </div>
    </div>
  );
}
