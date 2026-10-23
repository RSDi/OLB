import { redirect } from "next/navigation";
import { getViewer } from "../../../../lib/auth/viewer";
import { countRegistrations, loadRegistrations, type RegistrationTab } from "../../../../lib/teams/registration-data";
import { RegistrationsReview } from "./RegistrationsReview";
import { loadRegistrationNotes } from "../../../../lib/teams/player-note-data";
import { loadOnboardingBoard, loadWaitlistInfo, workflowEnabled } from "../../../../lib/onboarding/board-data";

// Registrations from the public form, for anyone with the Registrations
// permission (0102): New ones to review, the Waitlist (0115), Approved, and
// Removed. Approve puts the player under No team yet in the Directory and
// their fee on Payments; Waitlist keeps the family listed to reach and
// approve when a spot opens.
//
// The registration workflow (0130) adds the Onboarding tab and, on the
// Waitlist, each family's answers and Offer a spot: for the preview
// accounts, and for everyone here while the workflow is switched on.
export default async function RegistrationsPage({ searchParams }: { searchParams: Promise<{ tab?: string; open?: string }> }) {
  const { tab: asked, open } = await searchParams;
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!viewer.canManageRegistrations) redirect("/portal/directory");
  const showOnboarding = viewer.seesFullUi || (await workflowEnabled());
  if (asked === "onboarding" && showOnboarding) {
    const [counts, board] = await Promise.all([countRegistrations(), loadOnboardingBoard().catch(() => null)]);
    return <RegistrationsReview tab="onboarding" counts={counts} registrations={[]} notes={{}} showOnboarding board={board} openId={open ?? null} />;
  }
  const tab: RegistrationTab = asked === "waitlist" || asked === "approved" || asked === "removed" ? asked : "waiting";
  const [counts, registrations] = await Promise.all([countRegistrations(), loadRegistrations(tab)]);
  // Notes on the family (0124), on every tab but Approved.
  const notes =
    tab === "approved"
      ? new Map()
      : await loadRegistrationNotes(
          registrations.map((r) => r.id),
          { userId: viewer.userId, isSuperAdmin: viewer.isSuperAdmin }
        );
  const waitlistInfo = tab === "waitlist" ? await loadWaitlistInfo(registrations.map((r) => r.id)).catch(() => null) : null;
  return (
    <RegistrationsReview
      tab={tab}
      counts={counts}
      registrations={registrations}
      notes={Object.fromEntries(notes)}
      showOnboarding={showOnboarding}
      waitlistInfo={waitlistInfo}
      openId={open ?? null}
    />
  );
}
