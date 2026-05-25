import { redirect } from "next/navigation";

// The maintenance form has moved into the portal so submissions are tied
// to a signed-in member. Old bookmarks land here and get forwarded.
export default function MaintenanceRedirect() {
  redirect("/portal/maintenance/new");
}
