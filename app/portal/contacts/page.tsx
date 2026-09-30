import { loadContacts, loadContactCategories, loadContactsViewer } from "./_shared/data";
import { ContactsList } from "./ContactsList";

export default async function ContactsPage() {
  // Access guard: the board and the coaches, before any rendering.
  const viewer = await loadContactsViewer();

  const [contacts, categories] = await Promise.all([loadContacts(), loadContactCategories()]);

  return (
    <ContactsList contacts={contacts} categories={categories} canEdit={viewer.isStaff} />
  );
}
