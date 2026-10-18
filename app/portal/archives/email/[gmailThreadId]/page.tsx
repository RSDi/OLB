import { notFound } from "next/navigation";
import { loadEmailArchiveViewer } from "../../../../../lib/email-archive/access";
import { loadEmailThread, loadEmailThreadList } from "../../../../../lib/email-archive/data";
import { isGmailThreadId } from "../../../../../lib/email-archive/format";
import { EmailInbox } from "../EmailInbox";

export default async function ArchivesEmailThreadPage({
  params,
}: {
  params: Promise<{ gmailThreadId: string }>;
}) {
  await loadEmailArchiveViewer();
  const { gmailThreadId: raw } = await params;
  const gmailThreadId = decodeURIComponent(raw);
  if (!isGmailThreadId(gmailThreadId)) notFound();

  const [{ threads, missingTable }, selected] = await Promise.all([
    loadEmailThreadList(),
    loadEmailThread(gmailThreadId),
  ]);
  if (selected && "missingTable" in selected) {
    return <EmailInbox threads={[]} selected={null} missingTable />;
  }
  if (!selected) notFound();

  return <EmailInbox threads={threads} selected={selected} missingTable={missingTable} />;
}
