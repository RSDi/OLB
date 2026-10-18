import { loadEmailArchiveViewer } from "../../../../lib/email-archive/access";
import { loadEmailThreadList } from "../../../../lib/email-archive/data";
import { EmailInbox } from "./EmailInbox";

export default async function ArchivesEmailPage() {
  await loadEmailArchiveViewer();
  const { threads, missingTable } = await loadEmailThreadList();
  return <EmailInbox threads={threads} selected={null} missingTable={missingTable} />;
}
