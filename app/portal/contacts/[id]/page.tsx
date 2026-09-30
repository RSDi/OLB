import { notFound } from "next/navigation";
import {
  loadChildContacts,
  loadContact,
  loadContactsViewer,
  loadResolvedLinksForContact,
} from "../_shared/data";
import { ContactDetail } from "./ContactDetail";
import { getViewer } from "../../../../lib/auth/viewer";
import { createClient } from "../../../../lib/supabase/server";
import { viewerCanUseHsSchedule } from "../../../../lib/hs-schedule/viewer";
import { loadContactScheduleHistory } from "../../../../lib/hs-schedule/data";
import { loadLastContactChange } from "../../../../lib/contacts/history-data";

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const viewer = await loadContactsViewer();
  const { id } = await params;

  const contact = await loadContact(id);
  if (!contact) notFound();
  const isCompany = contact.kind === "company";
  const parentId = !isCompany ? contact.parent?.id ?? null : null;
  const schedule = await getViewer().then(viewerCanUseHsSchedule);
  // Coaches read the contact; the board also edits it, sees what uses it and
  // its history.
  const board = viewer.isStaff;

  // A company: the people who work there. A person: their company, and who
  // else works there.
  const [people, company, coworkers, links, history, lastChange] = await Promise.all([
    isCompany ? loadChildContacts(id) : Promise.resolve([]),
    parentId ? loadContact(parentId) : Promise.resolve(null),
    parentId ? loadChildContacts(parentId) : Promise.resolve([]),
    board ? loadResolvedLinksForContact(id) : Promise.resolve([]),
    // The weekends a program came to (or a facility hosted), when the
    // viewer can use the HS Schedule.
    isCompany && schedule
      ? createClient().then((supabase) => loadContactScheduleHistory(supabase, id))
      : Promise.resolve([]),
    board ? createClient().then((supabase) => loadLastContactChange(supabase, id)) : Promise.resolve(null),
  ]);

  return (
    <ContactDetail
      contact={contact}
      people={people}
      company={company}
      coworkers={coworkers.filter((c) => c.id !== id)}
      links={links}
      history={history}
      canEdit={board}
      canDelete={viewer.isSuperAdmin}
      lastChange={lastChange}
    />
  );
}
