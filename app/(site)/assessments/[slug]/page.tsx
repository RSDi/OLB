import type { Metadata } from "next";
import { notFound } from "next/navigation";
import "../../../components/olb.css";
import { loadAssessmentBySlug } from "../../../../lib/onboarding/assessment-data";
import { isPreviewDeployment } from "../../../../lib/onboarding/preview-only";
import AssessmentFlow from "../AssessmentFlow";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const assessment = await loadAssessmentBySlug(slug);
  return {
    title: assessment?.name || "Assessment",
    robots: { index: false, follow: false },
  };
}

// Preview-only. Production 404s this path. Not in the site menu.
export default async function AssessmentSlugPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ dob?: string; grade?: string }>;
}) {
  if (!isPreviewDeployment()) notFound();
  const [{ slug }, q] = await Promise.all([params, searchParams]);
  const assessment = await loadAssessmentBySlug(slug);
  if (!assessment || !assessment.open) notFound();
  const dob = typeof q.dob === "string" && /^\d{4}-\d{2}-\d{2}$/.test(q.dob) ? q.dob : "";
  const grade = typeof q.grade === "string" ? q.grade : "";
  return (
    <div className="olb-root">
      <AssessmentFlow assessment={assessment} initial={{ athlete_dob: dob, grade }} />
    </div>
  );
}
