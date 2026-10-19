// Invoice and reminder email bodies. The host sends them through the adapter.

import type { Branding, OrgSettings } from "./adapter.ts";
import { computeInvoice, formatDay, formatMoney, payNowCents } from "./logic.ts";
import type { Invoice } from "./types.ts";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function memo(invoice: Invoice): string {
  const event = invoice.eventLabel?.trim();
  const name = invoice.customerName.trim();
  return event ? `${event} – ${name}` : name;
}

export function invoiceEmailContent(
  invoice: Invoice,
  today: string,
  org: OrgSettings,
  branding: Branding,
  publicUrl: string
): { subject: string; text: string; html: string } {
  const totals = computeInvoice(invoice, today);
  const amount = formatMoney(payNowCents(invoice));
  const depositNote = invoice.depositCents > 0 && !totals.depositPaid ? " (deposit)" : "";
  const subject = `Invoice ${invoice.number} from ${branding.orgName}`;
  const addr = org.checkAddress.length ? org.checkAddress.join(", ") : "reply to this email for the mailing address";
  const lines = invoice.lines.map((l) => `  ${l.description}  ${l.qty} × ${formatMoney(l.unitCents)} = ${formatMoney(l.qty * l.unitCents)}`).join("\n");

  const text = [
    `${branding.orgName}`,
    `Invoice ${invoice.number}`,
    invoice.eventLabel ? invoice.eventLabel : "",
    "",
    `To: ${invoice.customerName}`,
    `Total: ${formatMoney(totals.totalCents)} due ${formatDay(invoice.dueOn, true)}`,
    invoice.depositCents ? `Deposit: ${formatMoney(invoice.depositCents)} due ${formatDay(invoice.depositDueOn, true)}` : "",
    `Balance: ${formatMoney(totals.balanceCents)}`,
    "",
    "Line items:",
    lines,
    "",
    "How to pay",
    `Venmo: send ${amount}${depositNote} to @${org.venmoHandle} (${org.venmoUrl})`,
    `Note: ${memo(invoice)}`,
    `Check: payable to ${org.checkPayee}. Mail to ${addr}. Memo: ${memo(invoice)}`,
    "",
    `View this invoice: ${publicUrl}`,
  ]
    .filter((x) => x !== "")
    .join("\n");

  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#121214">
  <p style="margin:0 0 4px;font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#666">${esc(invoice.number)}</p>
  <h1 style="margin:0 0 8px;font-size:22px">${esc(invoice.customerName)}</h1>
  <p style="margin:0 0 16px;color:#555">${invoice.eventLabel ? esc(invoice.eventLabel) + " · " : ""}due ${esc(formatDay(invoice.dueOn, true))}</p>
  <table style="width:100%;border-collapse:collapse;margin:0 0 16px">${invoice.lines
    .map(
      (l) =>
        `<tr><td style="padding:6px 0;border-bottom:1px solid #eee">${esc(l.description)}</td><td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right">${l.qty} × ${esc(formatMoney(l.unitCents))}</td><td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right;font-weight:700">${esc(formatMoney(l.qty * l.unitCents))}</td></tr>`
    )
    .join("")}
    <tr><td style="padding:10px 0;font-weight:800">Total</td><td></td><td style="padding:10px 0;text-align:right;font-weight:800">${esc(formatMoney(totals.totalCents))}</td></tr>
  </table>
  <p><strong>Venmo</strong> — send ${esc(amount)}${depositNote} to @${esc(org.venmoHandle)}<br>
  <a href="${esc(org.venmoUrl)}">${esc(org.venmoUrl)}</a><br>
  Note: <strong>${esc(memo(invoice))}</strong></p>
  <p><strong>Check</strong> — payable to ${esc(org.checkPayee)}<br>
  Mail to: ${esc(addr)}<br>
  Memo: <strong>${esc(memo(invoice))}</strong></p>
  <p><a href="${esc(publicUrl)}">View this invoice</a></p>
</div>`;

  return { subject, text, html };
}

export function reminderEmailContent(
  invoice: Invoice,
  today: string,
  org: OrgSettings,
  branding: Branding,
  publicUrl: string
): { subject: string; text: string; html: string } {
  const body = invoiceEmailContent(invoice, today, org, branding, publicUrl);
  const amount = formatMoney(payNowCents(invoice));
  const deposit = invoice.depositCents > 0 && !computeInvoice(invoice, today).depositPaid;
  return {
    subject: `Reminder: ${amount} ${deposit ? "deposit " : ""}still due — ${invoice.number}`,
    text: `This is a reminder from ${branding.orgName}.\n\n${body.text}`,
    html: `<p style="font-family:system-ui,sans-serif">This is a reminder from ${esc(branding.orgName)}.</p>${body.html}`,
  };
}
