"use client";

import { useEffect, useState } from "react";
import { Pill } from "../../components/ui";
import { disconnectGmailSender, loadGmailSettings } from "../../../lib/invoicing/gmail-actions";
import { gmailBannerKind, type InvoiceGmailConnection } from "../../../lib/invoicing/gmail-meta";

const OUTCOMES: Record<string, string> = {
  connected: "Gmail is connected. Invoices and reminders will send from that account.",
  denied: "Google didn't grant access. Try Connect Gmail again.",
  failed: "Couldn't finish connecting Gmail. Try again.",
  "not-allowed": "You need the Invoicing permission to connect Gmail.",
  "not-set-up": "Gmail isn't set up in Vercel yet (client id, secret, and token key).",
  preview: "Can't connect Gmail while previewing as someone else.",
};

function formatWhen(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Never";
  return (
    d.toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "America/Chicago",
    }) + " CT"
  );
}

export function InvoicingGmailCard({ outcome }: { outcome?: string }) {
  const [configured, setConfigured] = useState(false);
  const [connection, setConnection] = useState<InvoiceGmailConnection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(outcome && OUTCOMES[outcome] ? OUTCOMES[outcome] : null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadGmailSettings().then((res) => {
      if ("error" in res) {
        setError(res.error);
        setLoading(false);
        return;
      }
      setConfigured(res.configured);
      setConnection(res.connection);
      setLoading(false);
    });
  }, []);

  function connect() {
    window.location.href =
      "/api/invoicing/gmail/connect?next=" + encodeURIComponent("/portal/payments?tab=invoices");
  }

  async function disconnect() {
    setBusy(true);
    setError(null);
    const res = await disconnectGmailSender();
    setBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    if (res.connection) setConnection(res.connection);
    setNotice("Gmail disconnected. Invoices will use Resend if it's set up, otherwise they stay Draft.");
  }

  const banner = connection ? gmailBannerKind(connection) : null;

  return (
    <div data-tour="invoices-gmail" className="rsd-card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontWeight: 800, fontSize: 15 }}>Invoice email</div>
      <p style={{ margin: 0, fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500, lineHeight: 1.5 }}>
        <strong>Connect Gmail</strong>
        {" "}
        once as Treasurer, President, or Athletic Director. After that, invoices and reminders send from that Gmail
        account and show up in its Sent folder. If Gmail isn&apos;t connected, the site uses Resend when that&apos;s set
        up. Replies go to the connected Gmail unless a reply-to address is set for the site.
      </p>
      {notice && (
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--gw-success)" }}>{notice}</p>
      )}
      {error && (
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--gw-error)" }}>{error}</p>
      )}
      {banner === "reconnect" && (
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--gw-error)" }}>
          Reconnect Gmail — it isn&apos;t connected anymore. The invoice stayed Draft.
        </p>
      )}
      {banner === "retry" && (
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--gw-error)" }}>
          Reconnect Gmail — the last send failed, try again. The invoice stayed Draft.
        </p>
      )}
      {loading ? (
        <div style={{ fontSize: 13, color: "var(--gw-fg-muted)" }}>Loading…</div>
      ) : !configured ? (
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>
          Add <strong>INVOICE_GMAIL_CLIENT_ID</strong>, <strong>INVOICE_GMAIL_CLIENT_SECRET</strong>, and{" "}
          <strong>INVOICE_GMAIL_TOKEN_KEY</strong> in Vercel, then come back here to connect.
        </p>
      ) : connection?.connected ? (
        <>
          <div style={{ fontSize: 14, fontWeight: 700 }}>
            Connected as {connection.senderEmail ?? "Gmail"}.
          </div>
          <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500, lineHeight: 1.5 }}>
            Last used: {formatWhen(connection.lastUsedAt)}
            {connection.lastError ? (
              <>
                <br />
                Last error: {connection.lastError}
              </>
            ) : null}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Pill size="sm" variant="accent" disabled={busy} onClick={() => connect()}>
              Reconnect Gmail
            </Pill>
            <Pill size="sm" variant="ghost" disabled={busy} onClick={() => void disconnect()}>
              Disconnect
            </Pill>
          </div>
        </>
      ) : (
        <div>
          <Pill size="sm" variant="accent" disabled={busy} onClick={() => connect()}>
            Connect Gmail
          </Pill>
        </div>
      )}
    </div>
  );
}
