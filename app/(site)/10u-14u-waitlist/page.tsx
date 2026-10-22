import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "../../components/olb.css";
import { isPreviewDeployment } from "../../../lib/onboarding/competitive-waitlist-form";
import CompetitiveWaitlistFlow from "./WaitlistFlow";

export const metadata: Metadata = {
  title: "10U–14U Competitive Waitlist",
  robots: { index: false, follow: false },
};
// VERCEL_ENV is inlined per deploy; force-dynamic so a local visit still
// reads the current process env.
export const dynamic = "force-dynamic";

// Preview-only Cognito replacement for the 10U–14U competitive waitlist.
// Production 404s this path and the action refuses the write. Not in the
// site menu.
export default function CompetitiveWaitlistPage() {
  if (!isPreviewDeployment()) notFound();
  return (
    <div className="olb-root">
      <CompetitiveWaitlistFlow />
    </div>
  );
}
