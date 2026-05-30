import { AccessDenied } from "../_shared/AccessDenied";
import {
  loadMembers,
  loadMemberTeamMap,
  loadViewer,
  loadVolunteerTeams,
} from "../_shared/data";
import { AllMembersList } from "./AllMembersList";

export default async function AllMembersPage() {
  const viewer = await loadViewer();
  if (!viewer) return <AccessDenied />;

  // Include extended; memorials excluded by default.
  const [members, teams, memberTeams] = await Promise.all([
    loadMembers({ categories: ["regular", "extended"] }),
    loadVolunteerTeams(),
    loadMemberTeamMap(),
  ]);
  return (
    <AllMembersList
      members={members}
      teams={teams}
      memberTeams={memberTeams}
      currentMemberId={viewer.memberId}
    />
  );
}
