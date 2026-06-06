import { loadContacts, loadContactCategories, loadContactsViewer } from "./_shared/data";
import { ContactsList } from "./ContactsList";

export default async function ContactsPage() {
  // Access guard — redirects non-staff before any rendering.
  await loadContactsViewer();

  const [contacts, categories] = await Promise.all([
    loadContacts(),
    loadContactCategories(),
  ]);

  return <ContactsList contacts={contacts} categories={categories} />;
}
