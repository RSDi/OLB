import Link from "next/link";
import { notFound } from "next/navigation";
import { Icons } from "../../../../components/icons";
import { createClient } from "../../../../../lib/supabase/server";
import { loadContactHistory } from "../../../../../lib/contacts/history-data";
import { differsFrom } from "../../../../../lib/contacts/history";
import { loadContact, loadContactsViewer } from "../../_shared/data";
import { HistoryNotice, VersionEntry } from "../../_shared/VersionEntry";

// Every change to one contact, newest first: who made it, when, and each
// field before and after. Versions are written by the database (migration
// 0109), so nothing saved can skip them. The board only.
export default async function ContactHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  await loadContactsViewer({ board: true });
  const { id } = await params;
  const contact = await loadContact(id);
  if (!contact) notFound();

  const history = await loadContactHistory(await createClient(), id);
  const current = contact as unknown as Record<string, unknown>;

  return (
    <>
      <Link
        href={`/portal/contacts/${id}`}
        style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13, fontWeight: 700, color: "var(--gw-fg-muted)", textDecoration: "none" }}
      >
        <Icons.ChevronLeft width={14} height={14} /> {contact.name}
      </Link>
      <div>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>History</h2>
        <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", marginTop: 4, lineHeight: 1.6 }}>
          Every change to this contact, newest first, with who made it. Restoring an older version saves it as a new
          change, so nothing is ever lost.
        </div>
      </div>

      {!history.ok ? (
        <HistoryNotice />
      ) : history.versions.length === 0 ? (
        <div className="rsd-card" style={{ padding: "40px 24px", textAlign: "center", fontSize: 14, color: "var(--gw-fg-muted)" }}>
          No changes yet.
        </div>
      ) : (
        <div className="rsd-card" style={{ gap: 0, padding: 0, overflow: "hidden" }}>
          {history.versions.map((v, i) => (
            <VersionEntry
              key={v.id}
              version={v}
              names={history.names}
              lookups={history.lookups}
              first={i === 0}
              restorable={i > 0 && (v.action === "edited" || v.action === "created" || v.action === "start") && differsFrom(v.snapshot, current)}
            />
          ))}
        </div>
      )}
    </>
  );
}
