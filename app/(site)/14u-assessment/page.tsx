import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { BUILTIN_14U, assessmentPublicPath } from "../../../lib/onboarding/assessments";
import { previewRouteOpen } from "../../../lib/onboarding/preview-only";

export const metadata: Metadata = {
  title: "14U Assessment",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

// The 14U form now lives at /assessments/14u. Keep this address so the
// preview link Jeff already sent still works, including on production.
export default function AssessmentPage() {
  if (!previewRouteOpen("assessments")) notFound();
  redirect(assessmentPublicPath(BUILTIN_14U));
}
