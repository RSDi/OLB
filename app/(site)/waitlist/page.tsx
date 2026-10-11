import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "../../components/olb.css";
import { createAdminClient } from "../../../lib/supabase/admin";
import { workflowOn } from "../../../lib/onboarding/server";
import WaitlistForm from "./WaitlistForm";

export const metadata: Metadata = { title: "Join the Waitlist" };
// Checked on every visit, so the page opens and closes with the switch.
export const dynamic = "force-dynamic";

// The public "Join the waitlist" form (0130): new families tell us about
// their son, the same things Rachel asks every family. It lands on the
// Directory's Waitlist tab. Open only while the registration workflow is on;
// otherwise there's no page here, and the Programs page's Cognito link is
// the way in.
export default async function WaitlistPage() {
  let open = false;
  try {
    open = !!(await workflowOn(createAdminClient()));
  } catch (e) {
    console.error("[waitlist] checking the workflow failed", e);
  }
  if (!open) notFound();
  return (
    <div className="olb-root">
      <WaitlistForm />
    </div>
  );
}
