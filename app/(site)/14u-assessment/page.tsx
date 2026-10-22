import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "../../components/olb.css";
import { isPreviewDeployment } from "../../../lib/onboarding/preview-only";
import AssessmentForm from "./AssessmentForm";

export const metadata: Metadata = {
  title: "14U Assessment",
  robots: { index: false, follow: false },
};
// VERCEL_ENV is inlined per deploy; force-dynamic so a local visit still
// reads the current process env.
export const dynamic = "force-dynamic";

// Preview-only clone of /waitlist, locked to 14U. Production 404s this path
// and the action refuses the write. Not in the site menu.
export default function AssessmentPage() {
  if (!isPreviewDeployment()) notFound();
  return (
    <div className="olb-root">
      <AssessmentForm />
    </div>
  );
}
