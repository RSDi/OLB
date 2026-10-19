"use client";

import { reminderCopy, reminderTargetDue } from "../logic";
import type { Invoice, ReminderFreq, ReminderSettings } from "../types";
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
}: {
  settings: ReminderSettings;
  canInvoice: boolean;
  invoice?: Invoice;
  fromEmail: string;
  onChange: (next: ReminderSettings) => void | Promise<void>;
}) {
  const due = invoice ? reminderTargetDue(invoice) : undefined;
  return (
    <Card>
      <Cap>Reminders</Cap>
      <Field label="How often">
        <div style={{ display: "flex", border: `1px solid var(--inv-border, var(--gw-border, #e4e4df))`, borderRadius: 100, overflow: "hidden", background: "var(--inv-elev, #fff)" }}>
          {FREQS.map((f) => (
            <button
              key={f.key}
              type="button"
              disabled={!canInvoice}
              onClick={() => onChange({ ...settings, freq: f.key })}
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
            onChange={(e) => onChange({ ...settings, startDays: Number(e.target.value) })}
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
            onChange={(e) => onChange({ ...settings, untilPaid: e.target.value === "1" })}
            style={{ minHeight: 44, borderRadius: 10, border: "1px solid var(--inv-border, var(--gw-border, #e4e4df))", padding: "0 12px", fontSize: 16, fontWeight: 600, width: "100%" }}
          >
            <option value="1">Until paid</option>
            <option value="0">After 3 reminders</option>
          </select>
        </Field>
      </div>
      <div style={{ fontSize: 13, color: t.muted, margin: 0 }}>{reminderCopy(settings, due || "2026-11-01", fromEmail)}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: t.fg }}>Anyone with invoicing permission can change this.</div>
      <LockNote show={!canInvoice} />
    </Card>
  );
}
