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
  // its history, and so does the External Contacts permission (0123), less
  // what uses it (tasks and playbooks are the board's). The travel
  // coordinator edits the hotels and places to eat (the database's own test,
  // 0110).
  const board = viewer.isStaff;
  const editor = viewer.canEditContacts;
  const canEdit =
    editor ||
    (viewer.canManageTravel &&
      (await createClient().then((supabase) =>
        supabase
          .rpc("contact_is_travel", { p_category_id: contact.category_id, p_parent_contact_id: contact.parent_contact_id })
          .then(({ data }) => data === true)
      )));

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
    editor ? createClient().then((supabase) => loadLastContactChange(supabase, id)) : Promise.resolve(null),
  ]);

  return (
    <ContactDetail
      contact={contact}
      people={people}
      company={company}
      coworkers={coworkers.filter((c) => c.id !== id)}
      links={links}
      history={history}
      canEdit={canEdit}
      canHistory={editor}
      canDelete={viewer.isSuperAdmin}
      lastChange={lastChange}
    />
  );
}
