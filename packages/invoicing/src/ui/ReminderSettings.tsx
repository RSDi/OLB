"use client";

import { useState } from "react";
import { reminderCopy, reminderTargetDue } from "../logic";
import type { Invoice, InvoiceClubSettings, ReminderFreq, ReminderSettings } from "../types";
import { Card, Cap, Field, LockNote } from "./parts";
import { t } from "./theme";

const FREQS: { key: ReminderFreq; label: string }[] = [
  { key: "off", label: "Off" },
  { key: "3d", label: "Every 3 days" },
  { key: "weekly", label: "Weekly" },
  { key: "2w", label: "Every 2 weeks" },
];

export function ReminderSettingsCard({
  settings,
  canInvoice,
  invoice,
  fromEmail,
  onChange,
  clubSettings,
  onChangeClub,
  overrideOn,
  onToggleOverride,
}: {
  settings: ReminderSettings;
  canInvoice: boolean;
  invoice?: Invoice;
  fromEmail: string;
  onChange: (next: ReminderSettings) => void | Promise<void>;
  clubSettings?: ReminderSettings;
  onChangeClub?: (next: ReminderSettings) => void | Promise<void>;
  overrideOn?: boolean;
  onToggleOverride?: (on: boolean) => void | Promise<void>;
}) {
  const due = invoice ? reminderTargetDue(invoice) : undefined;
  const usingOverride = !!overrideOn && !!invoice;

  function apply(next: ReminderSettings) {
    if (usingOverride) {
      void onChange(next);
      return;
    }
    void (onChangeClub ?? onChange)(next);
  }

  return (
    <Card>
      <Cap>Reminders</Cap>
      {invoice && onToggleOverride && (
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}>
          <input type="checkbox" checked={usingOverride} disabled={!canInvoice} onChange={(e) => void onToggleOverride(e.target.checked)} />
          Custom for this invoice
        </label>
      )}
      <Field label={usingOverride ? "This invoice" : "Club default"}>
        <div style={{ display: "flex", border: `1px solid var(--inv-border, var(--gw-border, #e4e4df))`, borderRadius: 100, overflow: "hidden", background: "var(--inv-elev, #fff)" }}>
          {FREQS.map((f) => (
            <button
              key={f.key}
              type="button"
              disabled={!canInvoice}
              onClick={() => apply({ ...(usingOverride ? settings : (clubSettings ?? settings)), freq: f.key })}
              style={{
                flex: 1,
                minHeight: 40,
                border: 0,
                background: settings.freq === f.key ? "var(--inv-ink, #121214)" : "none",
                color: settings.freq === f.key ? "#fff" : "inherit",
                fontWeight: 700,
                fontSize: 12.5,
                padding: "2px 4px",
                cursor: canInvoice ? "pointer" : "not-allowed",
                opacity: canInvoice ? 1 : 0.5,
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Start reminding">
          <select
            disabled={!canInvoice}
            value={settings.startDays}
            onChange={(e) => apply({ ...settings, startDays: Number(e.target.value) })}
            style={{ minHeight: 44, borderRadius: 10, border: "1px solid var(--inv-border, var(--gw-border, #e4e4df))", padding: "0 12px", fontSize: 16, fontWeight: 600, width: "100%" }}
          >
            {[3, 5, 7, 14].map((n) => (
              <option key={n} value={n}>
                {n} days before
              </option>
            ))}
          </select>
        </Field>
        <Field label="Stop">
          <select
            disabled={!canInvoice}
            value={settings.untilPaid ? "1" : "0"}
            onChange={(e) => apply({ ...settings, untilPaid: e.target.value === "1" })}
            style={{ minHeight: 44, borderRadius: 10, border: "1px solid var(--inv-border, var(--gw-border, #e4e4df))", padding: "0 12px", fontSize: 16, fontWeight: 600, width: "100%" }}
          >
            <option value="1">Until paid</option>
            <option value="0">After 3 reminders</option>
          </select>
        </Field>
      </div>
      <div style={{ fontSize: 13, color: t.muted, margin: 0 }}>{reminderCopy(settings, due || "2026-11-01", fromEmail)}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: t.fg }}>
        {usingOverride ? "This invoice only. Uncheck to use the club default." : "Club default — anyone with invoicing permission can change it. An invoice can override it."}
      </div>
      <LockNote show={!canInvoice} />
    </Card>
  );
}

export function MailCopiesCard({
  canInvoice,
  club,
  invoiceCc,
  invoiceBcc,
  error,
  onSaveClub,
  onSaveInvoice,
}: {
  canInvoice: boolean;
  club: Pick<InvoiceClubSettings, "ccEmails" | "bccEmails">;
  invoiceCc?: string[] | null;
  invoiceBcc?: string[] | null;
  error?: string | null;
  onSaveClub?: (next: { ccEmails: string[]; bccEmails: string[] }) => void | Promise<{ error?: string } | void>;
  onSaveInvoice?: (next: { ccEmails: string[] | null; bccEmails: string[] | null }) => void | Promise<{ error?: string } | void>;
}) {
  const override = (invoiceCc !== null && invoiceCc !== undefined) || (invoiceBcc !== null && invoiceBcc !== undefined);
  const savedCc = (override ? invoiceCc : club.ccEmails) ?? [];
  const savedBcc = (override ? invoiceBcc : club.bccEmails) ?? [];
  const [ccText, setCcText] = useState(savedCc.join(", "));
  const [bccText, setBccText] = useState(savedBcc.join(", "));
  const [localError, setLocalError] = useState<string | null>(null);

  function parse(raw: string) {
    return raw.split(/[,;]+/).map((s) => s.trim()).filter(Boolean);
  }

  async function saveCc(raw: string) {
    const list = parse(raw);
    setCcText(raw);
    const res = override && onSaveInvoice
      ? await onSaveInvoice({ ccEmails: list, bccEmails: parse(bccText) })
      : await onSaveClub?.({ ccEmails: list, bccEmails: parse(bccText) });
    setLocalError(res?.error ?? null);
  }

  async function saveBcc(raw: string) {
    const list = parse(raw);
    setBccText(raw);
    const res = override && onSaveInvoice
      ? await onSaveInvoice({ ccEmails: parse(ccText), bccEmails: list })
      : await onSaveClub?.({ ccEmails: parse(ccText), bccEmails: list });
    setLocalError(res?.error ?? null);
  }

  return (
    <Card>
      <Cap>CC and BCC</Cap>
      <div style={{ fontSize: 13, color: t.muted }}>Optional. Empty is fine. Anyone with invoicing can set the club default. A single invoice or a batch can override it.</div>
      <Field label={override && onSaveInvoice ? "CC (this invoice)" : "CC (club default)"}>
        <input
          disabled={!canInvoice}
          value={ccText}
          placeholder="none"
          onChange={(e) => setCcText(e.target.value)}
          onBlur={(e) => void saveCc(e.target.value)}
          style={{ minHeight: 44, borderRadius: 10, border: "1px solid var(--inv-border, var(--gw-border, #e4e4df))", padding: "0 12px", fontSize: 16, width: "100%" }}
        />
      </Field>
      <Field label={override && onSaveInvoice ? "BCC (this invoice)" : "BCC (club default)"}>
        <input
          disabled={!canInvoice}
          value={bccText}
          placeholder="none"
          onChange={(e) => setBccText(e.target.value)}
          onBlur={(e) => void saveBcc(e.target.value)}
          style={{ minHeight: 44, borderRadius: 10, border: "1px solid var(--inv-border, var(--gw-border, #e4e4df))", padding: "0 12px", fontSize: 16, width: "100%" }}
        />
      </Field>
      {onSaveInvoice && (
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}>
          <input
            type="checkbox"
            checked={override}
            disabled={!canInvoice}
            onChange={(e) => {
              if (e.target.checked) void onSaveInvoice({ ccEmails: club.ccEmails, bccEmails: club.bccEmails });
              else void onSaveInvoice({ ccEmails: null, bccEmails: null });
            }}
          />
          Override for this invoice
        </label>
      )}
      {(localError || error) && <div style={{ color: t.error, fontWeight: 700, fontSize: 13 }}>{localError || error}</div>}
      <LockNote show={!canInvoice} />
    </Card>
  );
}
