import { notFound, redirect } from "next/navigation";
import { AccessDenied } from "../../_shared/AccessDenied";
import { loadMembers, loadRelationships, loadViewer } from "../../_shared/data";
import { computeHouseholds, findHouseholdFor } from "../../_shared/households";
import { FamilyView } from "./FamilyView";

export default async function FamilyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const viewer = await loadViewer();
  if (!viewer) return <AccessDenied />;

  const [members, relationships] = await Promise.all([
    loadMembers({ categories: ["regular", "extended"] }),
    loadRelationships(),
  ]);

  const households = computeHouseholds(members, relationships);
  const household = findHouseholdFor(households, id);
  if (!household) notFound();

  // A "family of one" isn't a family — bounce to the member's profile.
  const isSolo =
    household.heads.length === 1 &&
    household.children.length === 0 &&
    household.adultChildren.length === 0;
  if (isSolo) redirect(`/portal/directory/${household.heads[0].id}`);

  return (
    <FamilyView
      household={household}
      currentMemberId={viewer.memberId}
    />
  );
}
