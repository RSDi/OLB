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
export const GMAIL_SETUP_ERROR = "Gmail setup problem, contact a super admin";
export const GMAIL_SUPER_ADMIN_NOTE = "Only a super admin can connect or change the Gmail sender.";

/** Revoked / unreadable vs setup/config vs a temporary send failure. */
export type GmailBannerKind = "reconnect" | "setup" | "retry";

export function gmailBannerKind(connection: {
  connected: boolean;
  lastError: string | null;
}): GmailBannerKind | null {
  if (!connection.connected || !connection.lastError) return null;
  if (connection.lastError === GMAIL_SETUP_ERROR) return "setup";
  return connection.lastError === GMAIL_RECONNECT_ERROR ? "reconnect" : "retry";
}

/** Club-wide last_error is only relevant on an unsent, non-void invoice. */
export function invoiceCanShowGmailBanner(invoice: {
  sentAt: string | null;
  voidedAt: string | null;
}): boolean {
  return !invoice.sentAt && !invoice.voidedAt;
}
