import Link from "next/link";
import { Icons } from "../../../components/icons";
import { createClient } from "../../../../lib/supabase/server";
import { loadRecentContactChanges } from "../../../../lib/contacts/history-data";
import { loadContactsViewer } from "../_shared/data";
import { HistoryNotice, VersionEntry } from "../_shared/VersionEntry";

// The latest changes to every external contact, newest first (migration
// 0109): who changed what, including what the spreadsheet import added or
// filled in. Each contact's own History has the rest, and puts an earlier
// version back. The board only.
export default async function RecentContactChangesPage() {
  await loadContactsViewer({ board: true });
  const history = await loadRecentContactChanges(await createClient());

  return (
    <>
      <Link
        href="/portal/contacts"
        style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, fontWeight: 700, color: "var(--gw-fg-muted)", textDecoration: "none" }}
      >
        <Icons.ChevronLeft width={14} height={14} /> External Contacts
      </Link>
      <div>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Recent changes</h2>
        <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", marginTop: 4, lineHeight: 1.6 }}>
          The latest changes to every contact, newest first, with who made them. Open a contact and tap{" "}
          <strong>History</strong> to see all of its changes or put an earlier version back.
        </div>
      </div>

      {!history.ok ? (
        <HistoryNotice />
      ) : history.versions.length === 0 ? (
        <div className="rsd-card" style={{ padding: "40px 24px", textAlign: "center", fontSize: 14, color: "var(--gw-fg-muted)" }}>
          Nothing has changed since contact history began.
        </div>
      ) : (
        <div className="rsd-card" style={{ gap: 0, padding: 0, overflow: "hidden" }}>
          {history.versions.map((v, i) => (
            <VersionEntry key={v.id} version={v} names={history.names} lookups={history.lookups} showContact first={i === 0} />
          ))}
        </div>
      )}
    </>
  );
}
