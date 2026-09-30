import { redirect } from "next/navigation";
import { getViewer } from "../../../../lib/auth/viewer";
import { loadPendingRegistrations } from "../../../../lib/teams/registration-data";
import { RegistrationsReview } from "./RegistrationsReview";

// New registrations from the public form, for anyone with the Registrations
// permission (0102). Approve puts the player under No team yet in the
// Directory and their fee on Payments; Not this season takes it off the list.
export default async function RegistrationsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!viewer.canManageRegistrations) redirect("/portal/directory");
  const registrations = await loadPendingRegistrations();
  return <RegistrationsReview registrations={registrations} />;
}
