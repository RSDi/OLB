import { loadContacts, loadContactCategories, loadContactsViewer } from "./_shared/data";
import { ContactsList } from "./ContactsList";
import { getViewer } from "../../../lib/auth/viewer";
import { viewerCanUseHsSchedule } from "../../../lib/hs-schedule/viewer";

export default async function ContactsPage() {
  // Access guard: the board and the coaches, before any rendering.
  const viewer = await loadContactsViewer();

  const [contacts, categories, schedules] = await Promise.all([
    loadContacts(),
    loadContactCategories(),
    // The import also offers the HS Schedule's tabs to those who can use it.
    getViewer().then(viewerCanUseHsSchedule),
  ]);

  return (
    <ContactsList contacts={contacts} categories={categories} canEdit={viewer.isStaff} canImportSchedules={schedules} />
  );
}
