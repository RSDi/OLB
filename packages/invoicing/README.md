# Invoicing

A portable module for billing **other programs** (team fees when you host a tournament, co-host splits, gym shares). Payment is **Venmo or check** — invoices show instructions, not a card checkout.

Lives in `packages/invoicing/` because this repo already uses npm workspaces (`packages/*`) and the same pattern as `packages/reelnotes`. A `modules/` folder would not be wired into TypeScript paths or `npm test`.

OLB is the first host. Another Next.js/Supabase app (Operations) can implement the same adapter later. **This folder is the unit that would move to a shared module repository.** Do not import host `lib/` or `app/` from `src/`.

## What it does

- Draft, send, and resend invoices with line items, an optional **deposit** (own due date) and a **balance** due date
- Record Venmo or check payments (partials are fine); deposit and balance are tracked separately
- Statuses: Draft, Sent, Viewed, Partial, Paid, Overdue
- Batch-bill an event: one invoice per program
- Reminder settings + a job the host schedules
- UI the host mounts: invoices list, detail, mark-paid, batch preview, reminder settings, event rollup, public invoice page

## Adapter

Implement `InvoicingAdapter` (`src/adapter.ts`) and pass it to `createInvoicingService(adapter)`:

| Hook | Purpose |
|------|---------|
| `getServerClient` / `getAdminClient` | Supabase clients (RLS vs service role) |
| `getCurrentUser` | Opaque user id for `created_by` / `recorded_by` |
| `canInvoice` / `canViewInvoices` | Permission. Mutations refuse when `canInvoice` is false |
| `orgSettings` | Venmo handle/URL, check payee, **mailing address from host config** (never hard-coded) |
| `branding` | Org name on emails |
| `paths` | Host routes for list, detail, event, public invoice |
| `listEventCustomers` | Programs/teams for an event (ids stay opaque) |
| `onEventCollectionChanged` | Host ticks its own checklist when an event is fully sent/collected |
| `sendEmail` | Host mailer (OLB: club Gmail via existing Resend setup) |
| `today` | Host timezone date (`YYYY-MM-DD`) |

The module core **must not** import OLB. `packages/invoicing/tests/isolation.test.ts` fails if it does.

## How a host plugs in

1. Copy `migrations/0001_inv_schema.sql` into the host's migration stream.
2. Replace `inv_can_invoice()` / `inv_can_view_invoices()` with the host's permission helpers (OLB: `has_permission('invoicing')`).
3. Write a small adapter in the host (`lib/invoicing/` on OLB).
4. Mount UI from `invoicing/ui` on host pages. Styling uses CSS variables (`--inv-*`, falling back to `--gw-*` / `--rsd-*` if the host already has them). Do not hard-code host colors in the module.
5. Host checklist steps (Invoices sent, Bill programs, Team fees collected) stay in host code and call the service.

### OLB now

See `lib/invoicing/adapter.ts`. Treasurer, President, and Athletic Director get the `invoicing` permission (access profiles + planning-role holders). Finances → **Invoices**. Hosting checklist bills programs for a weekend.

### Operations later

Implement the same adapter against Operations' users, programs, and mailer. Tables are already `inv_*` with no FKs to OLB.

## Migrations

`migrations/0001_inv_schema.sql` creates:

- `inv_invoices` — customer (name/email + opaque host ids), totals via line items, deposit, due dates, send/view timestamps, public token
- `inv_line_items`
- `inv_payments` — venmo \| check
- `inv_reminder_settings` — one row
- `inv_reminder_sends` — dedupe
- `inv_sequences` — `INV-YYYY-0001`

No foreign keys to host tables. Host entity ids are `text`.

## Env vars (host)

The module does not read `process.env`. The host adapter should:

| Var | Use |
|-----|-----|
| `MAIL_CHECK_ADDRESS` | Check mailing address, lines separated by `\|` |
| `MAIL_FROM` / `INVOICE_MAIL_FROM` | From address (club Gmail if the host can send as it) |
| `MAIL_REPLY_TO` | Replies; OLB defaults to LightningBasketballOmaha@gmail.com |
| `RESEND_API_KEY` | OLB's existing sender |
| `INVOICE_TEST_EMAIL` | Non-production: send here instead of program emails |
| `CRON_SECRET` | Protect the reminder route |

Non-production must **not** email real programs: redirect to `INVOICE_TEST_EMAIL` or log.

## Reminder job

`createInvoicingService(adapter).runReminders()` scans unpaid sent invoices that are past due or coming due (start N days before the deposit, then the balance) and emails on the chosen cadence.

The host registers a cron that calls that method (OLB: `/api/cron/invoice-reminders`, daily, same `CRON_SECRET` pattern as balance reminders).
