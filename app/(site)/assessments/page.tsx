import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "../../components/olb.css";
import { loadOpenAssessments } from "../../../lib/onboarding/assessment-data";
import { isPreviewDeployment } from "../../../lib/onboarding/preview-only";
import { AssessmentPicker } from "./AssessmentPicker";

export const metadata: Metadata = {
  title: "Assessments",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

// Preview-only. Production 404s this path. Not in the site menu.
export default async function AssessmentsPage() {
  if (!isPreviewDeployment()) notFound();
  const assessments = await loadOpenAssessments();
  return (
    <div className="olb-root">
      <AssessmentPicker assessments={assessments} />
    </div>
  );
}
