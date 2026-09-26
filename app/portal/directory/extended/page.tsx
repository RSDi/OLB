import { AccessDenied } from "../_shared/AccessDenied";
import { loadMembers, loadRelationships, loadViewer } from "../_shared/data";
import { HouseholdsList } from "../households/HouseholdsList";

// Reuses the Households list component but only with category='extended'
// rows. Relationships still passed in so spouse + child links resolve when
// extended-family members are themselves married / have kids.
export default async function ExtendedPage() {
  // Started before the viewer check on purpose — see loadViewer().
  const data = Promise.all([
    loadMembers({ categories: ["extended"] }),
    loadRelationships(),
  ]);
  const viewer = await loadViewer();
  if (!viewer) return <AccessDenied />;

  const [members, relationships] = await data;

  return (
    <HouseholdsList
      members={members}
      relationships={relationships}
      currentMemberId={viewer.memberId}
    />
  );
}
