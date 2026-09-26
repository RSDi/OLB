import { AccessDenied } from "../_shared/AccessDenied";
import { loadMembers, loadRelationships, loadViewer } from "../_shared/data";
import { HouseholdsList } from "./HouseholdsList";

export default async function HouseholdsPage() {
  // Started before the viewer check on purpose — see loadViewer().
  const data = Promise.all([
    loadMembers({ categories: ["regular"] }),
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
