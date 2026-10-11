import type { Metadata } from "next";
import "../../components/olb.css";
import RegistrationFlow from "./RegistrationFlow";
import s from "./wizard.module.css";
import { createAdminClient } from "../../../lib/supabase/admin";
import { loadFormExtras } from "../../../lib/onboarding/server";
import { loadOfferSeed } from "../../../lib/onboarding/offers";
import type { FormExtras } from "../../../lib/onboarding/form-extras";
import { seasonFeeTiers } from "../../../lib/finances/club-data";
import { DEFAULT_FEE_TIERS, type FeeTier } from "../../../lib/finances/fees";

export const metadata: Metadata = { title: "Player Registration" };

// Public 2026-27 player registration: a step-by-step wizard that starts from
// the family's email (and fills in a returning family's details once they've
// typed back the code we email), or the whole form on one page. Submissions
// wait on the Directory's New registrations page
// (/portal/directory/registrations) for someone with the Registrations
// permission to approve.
//
// With the registration workflow on (0130), the form also asks for uniform
// sizes and the handbook signatures, and an offer link (?offer=…) starts
// with the offered player filled in. With it off, the page is as before.
export default async function PlayerRegistrationPage({ searchParams }: { searchParams: Promise<{ offer?: string }> }) {
  const { offer: token } = await searchParams;
  let config: FormExtras | null = null;
  try {
    config = await loadFormExtras(createAdminClient());
  } catch (e) {
    console.error("[registration] loading the workflow's questions failed", e);
  }
  const offer = config ? await loadOfferSeed(token) : null;
  // The season's fee tiers (Settings → Fees, 0131); the built-in ones until saved.
  let feeTiers: FeeTier[] = DEFAULT_FEE_TIERS;
  try {
    feeTiers = await seasonFeeTiers(createAdminClient());
  } catch (e) {
    console.error("[registration] loading the fee tiers failed", e);
  }
  return (
    <div className="olb-root">
      {offer === "expired" ? (
        <div className={s.wrap}>
          <div className={s.card}>
            <h2 className={s.question}>That offer link has run out</h2>
            <p className={s.lead}>
              It may have passed its date, or the registration was already sent. Reply to the email it came in, or email{" "}
              <strong>lightningbasketballomaha@gmail.com</strong>, and we&apos;ll sort it out.
            </p>
          </div>
        </div>
      ) : (
        <RegistrationFlow config={config} offer={offer} feeTiers={feeTiers} />
      )}
    </div>
  );
}
