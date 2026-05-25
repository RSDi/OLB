import { AccessDenied } from "../_shared/AccessDenied";
import { loadMembers, loadViewer } from "../_shared/data";
import { AllMembersList } from "./AllMembersList";

export default async function AllMembersPage() {
  const viewer = await loadViewer();
  if (!viewer) return <AccessDenied />;

  // Include extended; memorials excluded by default.
  const members = await loadMembers({ categories: ["regular", "extended"] });
  return <AllMembersList members={members} currentMemberId={viewer.memberId} />;
}
