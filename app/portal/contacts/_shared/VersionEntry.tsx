// One change in a contact's history (contact_versions, migration 0109): who
// made it, when, what it did and each field before and after. Used by a
// contact's History page and by Recent changes.

import Link from "next/link";
import {
  formatFieldValue,
  formatWhen,
  versionFieldChanges,
  versionSummary,
  type ContactVersion,
  type HistoryLookups,
} from "../../../../lib/contacts/history";
import { RestoreVersionButton } from "./RestoreVersionButton";

export function VersionEntry({
  version: v,
  names,
  lookups,
  showContact,
  restorable,
  first,
}: {
  version: ContactVersion;
  names: Map<string, string>;
  lookups: HistoryLookups;
  // Recent changes: name the contact it was.
  showContact?: boolean;
  // Offer "Restore this version" (not the latest, and it would change something).
  restorable?: boolean;
  first?: boolean;
}) {
  const changes = versionFieldChanges(v);
  const shown = v.action === "edited" ? changes : [];
  const saved = v.action === "created" || v.action === "start" ? changes : [];
  const contactName = String(v.snapshot?.name ?? "A contact");

  return (
    <div
      style={{
        padding: "14px 18px",
        borderTop: first ? "none" : "1px solid var(--gw-border)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        {showContact &&
          (v.action === "deleted" ? (
            <strong style={{ fontSize: 14 }}>{contactName}:</strong>
          ) : (
            <Link href={`/portal/contacts/${v.contact_id}`} style={{ fontSize: 14, fontWeight: 800, color: "var(--gw-fg)" }}>
              {contactName}:
            </Link>
          ))}
        {v.action === "start" ? (
          <span style={{ fontSize: 13, fontWeight: 700 }}>{versionSummary(v)}</span>
        ) : (
          <span style={{ fontSize: 13 }}>
            <strong>{who(v, names)}</strong> {versionSummary(v)}
          </span>
        )}
        {v.source === "import" && <span className="rsd-chip rsd-chip-mute" style={{ fontSize: 10 }}>Import spreadsheet</span>}
        {v.source === "restore" && <span className="rsd-chip rsd-chip-mute" style={{ fontSize: 10 }}>Restored</span>}
        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--gw-fg-muted)" }}>
          {v.action === "start" ? `As last saved ${formatWhen(v.changed_at)}` : formatWhen(v.changed_at)}
        </span>
      </div>

      {shown.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {shown.map((c) =>
            c.field.long ? (
              <details key={c.field.key}>
                <summary style={{ fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{c.field.label}</summary>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8, marginTop: 6 }}>
                  <TextBlock label="Before" text={formatFieldValue(c.field.key, c.before, lookups)} muted />
                  <TextBlock label="After" text={formatFieldValue(c.field.key, c.after, lookups)} />
                </div>
              </details>
            ) : (
              <div key={c.field.key} style={{ fontSize: 13, lineHeight: 1.5, overflowWrap: "anywhere" }}>
                <span style={{ fontWeight: 700 }}>{c.field.label}:</span>{" "}
                <s style={{ color: "var(--gw-fg-muted)" }}>{formatFieldValue(c.field.key, c.before, lookups)}</s>
                {" → "}
                <span>{formatFieldValue(c.field.key, c.after, lookups)}</span>
              </div>
            )
          )}
        </div>
      )}

      {saved.length > 0 && (
        <details>
          <summary style={{ fontSize: 12, fontWeight: 700, color: "var(--rsd-accent)", cursor: "pointer" }}>
            {v.action === "start" ? "What it had then" : "What it was added with"}
          </summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8 }}>
            {saved.map((c) => (
              <div key={c.field.key} style={{ fontSize: 13, lineHeight: 1.5, overflowWrap: "anywhere", whiteSpace: c.field.long ? "pre-wrap" : undefined }}>
                <span style={{ fontWeight: 700 }}>{c.field.label}:</span> {formatFieldValue(c.field.key, c.after, lookups)}
              </div>
            ))}
          </div>
        </details>
      )}

      {restorable && <RestoreVersionButton versionId={v.id} contactId={v.contact_id} when={formatWhen(v.changed_at)} />}
    </div>
  );
}

// "Kim Lee", or for a change made during a "Preview as" "Jeff (as Kim Lee)".
function who(v: ContactVersion, names: Map<string, string>): string {
  const actor = v.changed_by ? names.get(v.changed_by) ?? "A board member" : "Someone outside the portal";
  if (!v.impersonator_user_id) return actor;
  return `${names.get(v.impersonator_user_id) ?? "A super-admin"} (as ${actor})`;
}

function TextBlock({ label, text, muted }: { label: string; text: string; muted?: boolean }) {
  return (
    <div
      style={{
        border: "1px solid var(--gw-border)",
        borderRadius: 8,
        padding: "8px 10px",
        background: muted ? "var(--gw-bg)" : "var(--gw-bg-elev)",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--gw-fg-muted)", textTransform: "uppercase", letterSpacing: ".04em" }}>
        {label}
      </span>
      <span style={{ fontSize: 13, whiteSpace: "pre-wrap", overflowWrap: "anywhere", color: muted ? "var(--gw-fg-muted)" : "var(--gw-fg)" }}>
        {text}
      </span>
    </div>
  );
}

// Before migration 0109 there's no history to show.
export function HistoryNotice() {
  return (
    <div className="rsd-card" style={{ padding: "16px 20px", gap: 6, borderColor: "var(--rsd-warn-line)", background: "var(--rsd-warn-bg)" }}>
      <div style={{ fontSize: 14, fontWeight: 700 }}>Contact history isn&apos;t set up in the database yet</div>
      <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", lineHeight: 1.6 }}>
        It needs <code>supabase/migrations/0109_contact_history_and_coaches.sql</code>, which runs by itself when merged to
        main. Changes are kept from then on.
      </div>
    </div>
  );
}
