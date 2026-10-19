// Public Gmail connection status. Safe to import from client components.

export type InvoiceGmailConnection = {
  connected: boolean;
  senderEmail: string | null;
  connectedAt: string | null;
  lastUsedAt: string | null;
  lastError: string | null;
};

export type GmailMailAccount = {
  refreshToken: string;
  senderEmail: string;
};

export type GmailMailLoad =
  | { status: "none" }
  | { status: "ready"; account: GmailMailAccount }
  | { status: "unreadable" };

export const GMAIL_RECONNECT_ERROR = "Gmail isn't connected anymore. Reconnect Gmail, then send again.";

/** Revoked / unreadable connection vs a temporary send failure. */
export type GmailBannerKind = "reconnect" | "retry";

export function gmailBannerKind(connection: {
  connected: boolean;
  lastError: string | null;
}): GmailBannerKind | null {
  if (!connection.connected || !connection.lastError) return null;
  return connection.lastError === GMAIL_RECONNECT_ERROR ? "reconnect" : "retry";
}
