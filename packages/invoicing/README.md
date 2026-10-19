# Invoicing

A portable module for billing **other programs** (team fees when you host a tournament, co-host splits, gym shares). Payment is **Venmo or check** — invoices show instructions, not a card checkout.

Lives in `packages/invoicing/` because this repo already uses npm workspaces (`packages/*`) and the same pattern as `packages/reelnotes`. A `modules/` folder would not be wired into TypeScript paths or `npm test`.

OLB is the first host. Another Next.js/Supabase app (Operations) can implement the same adapter later. **This folder is the unit that would move to a shared module repository.** Do not import host `lib/` or `app/` from `src/`.

## What it does

- Draft, send, and resend invoices with line items, an optional **deposit** (own due date) and a **balance** due date. A deposit cannot exceed the total.
- Record Venmo or check payments (partials are fine); deposit and balance are tracked separately
- Statuses: Draft, Sent, Viewed, Partial, Paid, Overdue, **Void**. Voided invoices drop out of event totals. An invoice is **Sent** only after the email actually goes out.
- Batch-bill an event: one invoice per program, every email on file
- Club-wide reminder frequency plus an optional per-invoice override
- Optional **CC** and **BCC** (club-wide defaults in invoicing settings, optional override on a single invoice or a batch). Empty is fine. Never seeded.
- UI the host mounts: invoices list, detail, mark-paid, batch preview, reminder settings, event rollup, public invoice page

## Adapter

Implement `InvoicingAdapter` (`src/adapter.ts`) and pass it to `createInvoicingService(adapter)`:

| Hook | Purpose |
|------|---------|
| `getServerClient` / `getAdminClient` | Supabase clients (RLS vs service role) |
| `getCurrentUser` | Opaque user id for `created_by` / `recorded_by` |
| `canInvoice` / `canViewInvoices` | Permission. Mutations refuse when `canInvoice` is false |
| `orgSettings` | Venmo, check payee, **mailing address from host config**, and club CC/BCC defaults (read from invoicing settings — never hard-coded) |
| `branding` | Org name on emails |
| `paths` | Host routes for list, detail, event, public invoice |
| `listEventCustomers` | Programs/teams for an event (ids stay opaque). `createBatch` loads name and emails here, not from the browser. |
| `eventFeeCents` | Team fee for an event. `createBatch` uses this, not the browser's fee. |
| `onEventCollectionChanged` | Host ticks its own checklist when an event is billed / sent / collected |
| `sendEmail` | Host mailer |
| `today` | Host timezone date (`YYYY-MM-DD`) |

The module core **must not** import OLB. `packages/invoicing/tests/isolation.test.ts` fails if it does.

## How a host plugs in

1. Copy `migrations/0001_inv_schema.sql` into the host's migration stream.
2. Replace `inv_can_invoice()` / `inv_can_view_invoices()` with the host's permission helpers (OLB: `has_permission('invoicing')`).
3. Write a small adapter in the host (`lib/invoicing/` on OLB).
4. Mount UI from `invoicing/ui` on host pages. Styling uses CSS variables (`--inv-*`, falling back to `--gw-*` / `--rsd-*` if the host already has them). Do not hard-code host colors in the module.
5. Host checklist steps (Invoices sent, Bill programs, Team fees collected) stay in host code and call the service.

**Do not re-apply `0001_inv_schema.sql` after the host overlay** (OLB: 0152). It would replace `inv_can_invoice()` / `inv_can_view_invoices()` with the closed stubs and lock everyone out.

### OLB now

See `lib/invoicing/adapter.ts`. Treasurer, President, and Athletic Director get the `invoicing` permission (access profiles + planning-role holders). Finances → **Invoices**. Hosting checklist bills programs for a weekend.

**Sending:** Resend from the club's verified domain (`INVOICE_MAIL_FROM` or `MAIL_FROM`). Reply-to is the club Gmail (`MAIL_REPLY_TO`, default LightningBasketballOmaha@gmail.com). There is no Gmail API sending.

### Operations later

Implement the same adapter against Operations' users, programs, and mailer. Tables are already `inv_*` with no FKs to OLB.

## Migrations

`migrations/0001_inv_schema.sql` creates:

- `inv_invoices` — customer (name/email + opaque host ids), totals via line items, deposit, due dates, send/view/void timestamps, optional CC/BCC and reminder override, public token
- `inv_line_items`
- `inv_payments` — venmo \| check
- `inv_reminder_settings` — one row: club reminder cadence + CC/BCC (empty by default, never seeded)
- `inv_reminder_sends` — dedupe
- `inv_sequences` — `INV-YYYY-0001`. `inv_next_number()` refuses callers without invoicing permission.

No foreign keys to host tables. Host entity ids are `text`.

## Env vars (host)

The module does not read `process.env`. The host adapter should:

| Var | Use |
|-----|-----|
| `MAIL_CHECK_ADDRESS` | Check mailing address, lines separated by `\|` |
| `MAIL_FROM` / `INVOICE_MAIL_FROM` | From address on the verified domain (Resend) |
| `MAIL_REPLY_TO` | Replies; OLB defaults to LightningBasketballOmaha@gmail.com |
| `RESEND_API_KEY` | OLB's existing sender |
| `INVOICE_TEST_EMAIL` | Non-production: send here instead of program / CC / BCC addresses |
| `CRON_SECRET` | Protect the reminder route |

Live sending is `VERCEL_ENV === "production"` only. A local `next build && next start` is not live.

Non-production must **not** email real programs: redirect To, CC, and BCC to `INVOICE_TEST_EMAIL`, or log and do not mark the invoice Sent. CC and BCC ride on the first send **and** on reminders.

## Reminder job

`createInvoicingService(adapter).runReminders()` scans unpaid sent invoices that are past due or coming due (start N days before the deposit, then the balance) and emails on the club cadence, or the invoice's override.

The host registers a cron that calls that method (OLB: `/api/cron/invoice-reminders`, daily, same `CRON_SECRET` pattern as balance reminders).
