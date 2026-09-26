import { AccessDenied } from "../_shared/AccessDenied";
import {
  loadMembers,
  loadMemberTeamMap,
  loadViewer,
  loadVolunteerTeams,
} from "../_shared/data";
import { AllMembersList } from "./AllMembersList";

export default async function AllMembersPage() {
  // Include extended; memorials excluded by default. Started before the
  // viewer check on purpose — see loadViewer().
  const data = Promise.all([
    loadMembers({ categories: ["regular", "extended"] }),
    loadVolunteerTeams(),
    loadMemberTeamMap(),
  ]);
  const viewer = await loadViewer();
  if (!viewer) return <AccessDenied />;

  const [members, teams, memberTeams] = await data;
  return (
    <AllMembersList
      members={members}
      teams={teams}
      memberTeams={memberTeams}
      currentMemberId={viewer.memberId}
    />
  );
}
