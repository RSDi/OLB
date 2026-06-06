import { notFound } from "next/navigation";
import {
  loadChildContacts,
  loadContact,
  loadContactsViewer,
  loadResolvedLinksForContact,
} from "../_shared/data";
import { ContactDetail } from "./ContactDetail";

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const viewer = await loadContactsViewer();
  const { id } = await params;

  const contact = await loadContact(id);
  if (!contact) notFound();

  // For a company: list of people who work there.
  // For a person: empty (their own parent shows in the header).
  const people =
    contact.kind === "company" ? await loadChildContacts(id) : [];

  const links = await loadResolvedLinksForContact(id);

  return (
    <ContactDetail
      contact={contact}
      people={people}
      links={links}
      canDelete={viewer.isSuperAdmin}
    />
  );
}
