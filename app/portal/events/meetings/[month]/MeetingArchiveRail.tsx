import Link from "next/link";
import type { EmailArchiveThreadListItem } from "../../../../../lib/email-archive/data";
import { displayNameFromAddr, formatEmailWhen } from "../../../../../lib/email-archive/format";
import { emailThreadHref } from "../../../../../lib/slack-archive/paths";

export function MeetingArchiveRail({ emails }: { emails: EmailArchiveThreadListItem[] }) {
  return (
    <aside data-tour="meeting-linked-emails" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="rsd-card" style={{ padding: "14px 16px" }}>
        <h4
          style={{
            margin: "0 0 8px",
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: ".05em",
            color: "var(--gw-fg-muted)",
          }}
        >
          Linked emails (archived)
        </h4>
        {emails.length === 0 ? (
          <div style={{ fontSize: 12.5, color: "var(--gw-fg-muted)" }}>
            None yet. Archive a thread with Jeff&apos;s agent, or paste an Archives → Email link in the agenda.
          </div>
        ) : (
          emails.map((t) => (
            <div
              key={t.id}
              style={{
                display: "flex",
                gap: 8,
                alignItems: "flex-start",
                padding: "7px 0",
                borderTop: "1px solid var(--gw-border)",
                fontSize: 12.5,
              }}
            >
              <span aria-hidden>✉</span>
              <div>
                <Link href={emailThreadHref(t.gmailThreadId)} className="rsd-archive-link rsd-archive-link-email">
                  {t.subject || "(no subject)"}
                </Link>
                <div style={{ color: "var(--gw-fg-muted)", fontSize: 12 }}>
                  {displayNameFromAddr(t.participants[0] ?? "")}
                  {t.lastMessageAt ? ` · ${formatEmailWhen(t.lastMessageAt)}` : ""}
                  {t.messageCount > 1 ? ` · ${t.messageCount} msgs` : ""}
                  {t.attachmentCount > 0 ? ` · 📎${t.attachmentCount}` : ""}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
