import { AccessDenied } from "../_shared/AccessDenied";
import { loadMembers, loadRelationships, loadViewer } from "../_shared/data";
import { HouseholdsList } from "./HouseholdsList";

export default async function HouseholdsPage() {
  const viewer = await loadViewer();
  if (!viewer) return <AccessDenied />;

  const [members, relationships] = await Promise.all([
    loadMembers({ categories: ["regular"] }),
    loadRelationships(),
  ]);

  return (
    <HouseholdsList
      members={members}
      relationships={relationships}
      currentMemberId={viewer.memberId}
    />
  );
}
