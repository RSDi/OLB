import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "../../components/olb.css";
import { loadOpenAssessments } from "../../../lib/onboarding/assessment-data";
import { toPublicAssessment } from "../../../lib/onboarding/assessments";
import { previewRouteOpen } from "../../../lib/onboarding/preview-only";
import { AssessmentPicker } from "./AssessmentPicker";

export const metadata: Metadata = {
  title: "Assessments",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

// Assessments is on the production allowlist. Not in the site menu.
export default async function AssessmentsPage() {
  if (!previewRouteOpen("assessments")) notFound();
  const assessments = (await loadOpenAssessments()).map(toPublicAssessment);
  return (
    <div className="olb-root">
      <AssessmentPicker assessments={assessments} />
    </div>
  );
}
