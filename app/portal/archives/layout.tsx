import { getViewer } from "../../../lib/auth/viewer";
import { loadEmailCount } from "../../../lib/email-archive/data";
import { ArchivesTabs } from "./ArchivesTabs";

export default async function ArchivesLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  const staff = Boolean(viewer?.isStaff);
  const emailCount = staff ? await loadEmailCount() : 0;

  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 700, marginBottom: 6 }}>Archives</div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--gw-fg)", margin: "0 0 4px" }}>
        Archives
      </h1>
      <p style={{ color: "var(--gw-fg-muted)", fontSize: 13, fontWeight: 500, margin: "0 0 18px" }}>
        Copies of Slack conversations and emails the board references, so everyone can open them
        without Jeff&apos;s Gmail.
      </p>
      <ArchivesTabs staff={staff} emailCount={emailCount} />
      {children}
    </div>
  );
}
