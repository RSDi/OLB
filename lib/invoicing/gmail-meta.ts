// Public Gmail connection status. Safe to import from client components.

export type InvoiceGmailConnection = {
  connected: boolean;
  senderEmail: string | null;
  connectedAt: string | null;
  lastUsedAt: string | null;
  lastError: string | null;
};
