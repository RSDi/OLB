"use client";
// The season's fee tiers (Settings → Fees, 0131), handed down from the page
// so the wizard and the one-page form offer the same ones. Without a
// provider, the built-in tiers.
import { createContext, useContext, useMemo } from "react";
import { DEFAULT_FEE_TIERS, tierText, type FeeTier } from "../../../lib/finances/fees";
import { suggestedTier } from "../../../lib/teams/registration-form";

const FeeTiersContext = createContext<FeeTier[]>(DEFAULT_FEE_TIERS);

export function FeeTiersProvider({ tiers, children }: { tiers: FeeTier[]; children: React.ReactNode }) {
  return <FeeTiersContext.Provider value={tiers}>{children}</FeeTiersContext.Provider>;
}

export function useFeeTiers(): { texts: string[]; suggest: (dob: string | null | undefined) => string | null } {
  const tiers = useContext(FeeTiersContext);
  return useMemo(() => ({ texts: tiers.map(tierText), suggest: (dob) => suggestedTier(dob, tiers) }), [tiers]);
}
