import { redirect } from "next/navigation";
import { getViewer } from "../../../../../lib/auth/viewer";
import { olbInvoicePaths } from "../../../../../lib/invoicing/adapter";
import { churchToday } from "../../../../../lib/dates/today";
import { NewInvoicePage } from "./NewInvoicePage";

export default async function Page() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!viewer.canManageInvoicing) redirect(olbInvoicePaths.list);
  return <NewInvoicePage today={churchToday()} />;
}
