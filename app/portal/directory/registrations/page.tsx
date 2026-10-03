import { redirect } from "next/navigation";
import { getViewer } from "../../../../lib/auth/viewer";
import { countRegistrations, loadRegistrations, type RegistrationTab } from "../../../../lib/teams/registration-data";
import { RegistrationsReview } from "./RegistrationsReview";

// Registrations from the public form, for anyone with the Registrations
// permission (0102): Waiting to be reviewed, the Waitlist (0115) and
// Approved. Approve puts the player under No team yet in the Directory and
// their fee on Payments; Waitlist keeps the family listed to reach and
// approve when a spot opens.
export default async function RegistrationsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: asked } = await searchParams;
  const tab: RegistrationTab = asked === "waitlist" || asked === "approved" ? asked : "waiting";
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!viewer.canManageRegistrations) redirect("/portal/directory");
  const [counts, registrations] = await Promise.all([countRegistrations(), loadRegistrations(tab)]);
  return <RegistrationsReview tab={tab} counts={counts} registrations={registrations} />;
}
