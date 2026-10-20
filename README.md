# Omaha Lightning Basketball — Member Portal

Internal portal for Omaha Lightning Basketball: member directory, facilities &
maintenance ticketing, preventive maintenance (PM), events, supplies,
playbooks/docs, volunteer teams, and global search.

**Stack:** Next.js 16 (App Router) · React 19 · Supabase (Postgres + Auth + RLS)
· Tailwind CSS 4 · deployed on Vercel.

> ⚠️ This repo pins a customized build of Next.js. APIs and conventions may
> differ from upstream — read the relevant guide in `node_modules/next/dist/docs/`
> before writing framework code (see `AGENTS.md`).

## Getting started

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure environment**

   ```bash
   cp .env.example .env.local
   ```

   Fill in the values — see `.env.example` for what each variable is for. At a
   minimum you need the three Supabase keys. Email (Resend) is optional; the app
   degrades gracefully and skips sending if `RESEND_API_KEY` is unset.

3. **Set up the database**

   Apply the migrations in `supabase/migrations/` (numeric order) to your
   Supabase project — via the Supabase SQL editor or the CLI:

   ```bash
   supabase db push
   ```

   `0000_baseline.sql` creates the whole schema: every table plus its row-level
   security (RLS) policies. Later migrations are idempotent. The migrations the
   baseline replaced are kept for reference in `supabase/migrations-archive/`
   and are never applied.

   From 2026-10-30, new `public` tables, sequences, and functions need an
   explicit GRANT in the same migration or supabase-js/PostgREST returns
   `permission denied` (see `AGENTS.md`). `0156_data_api_table_grants.sql`
   granted existing post-baseline tables that had none. #219 (0154/0155)
   is live. Merge and push #220 first, then #215 (0157), so `supabase db
   push` applies 0156 before 0157. If 0157 is already applied, use
   `supabase db push --include-all` so 0156 still runs.

4. **Bootstrap the first admin**

   Set `ADMIN_EMAILS` to your address before signing up; the first matching
   account is promoted to super-admin so you can approve other members.

   Or create admins who sign in with a password straight away (needs
   `.env.local` with the service-role key):

   ```bash
   npm run create-admin -- --password 'temporary-password' you@example.com
   ```

   They're Super-admins, or Board members with `--role admin`. Re-running
   resets the password. Each person then picks their own at `/reset-password`.

5. **Import the season's registrations**

   ```bash
   npm run import-registrations -- path/to/registrations.xlsx --dry-run
   ```

   Reads the "Season Registration" sheet: players land in the Team manager's
   Unassigned pool (and the Directory) with their registration details, and
   their parents become approved members who can sign up or sign in with their
   registration email. Drop `--dry-run` to write; safe to re-run. Pass
   `--season 2027-2028` for a later season's board. Requires `.env.local` with
   the service-role key.

6. **Import the HS planning spreadsheet** (optional)

   In the portal, as a board member: **External Contacts → Import spreadsheet**
   (or **HS Schedule → Import spreadsheet**) and pick the "Omaha Lightning
   Schedule … Working copy for Coaches and Board" workbook. Its Contacts tab
   becomes External Contacts (programs, facilities and referees, with their
   people) and each "HS Schedule - 26-27" tab a season on the HS Schedule.
   You see everything it found before anything is saved; importing again only
   fills in blanks, and every change it makes shows in the contacts' History.
   Coaches read the Programs, Facilities and Referees it adds. Needs
   migrations 0107–0109.

7. **Run the dev server**

   ```bash
   npm run dev
   ```

   Open http://localhost:3000.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run type-check` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run import-registrations` | Import players and parents from the registration spreadsheet (see step 5 above) |
| `npm run create-admin` | Create admins who sign in with a password (see step 4 above) |
| `npm run slack-app-manifest` | Print the Slack app manifest for this site (see the Slack section of `.env.example`) |

## Project layout

```
app/                  Routes (App Router)
  (site)/             Public site: the Omaha Lightning Basketball pages (a port of
                      its Squarespace site; styles in _components/site.module.css)
                      and the sign-in pages (login, register, reset-password)
  portal/             Authenticated member portal
    directory/        Members, households, birthdays, volunteer-team filter, …
    schedule/         HS Schedule: the high school season weekend by weekend, for
                      coaches and the board (lib/hs-schedule, lib/hs-planning-import)
    maintenance/      Maintenance request tickets + comments
    pm/               Preventive maintenance: templates, instances, calendar, assets
    events/  supplies/  docs/   Events, supplies inventory, playbooks
    settings/         Admin tabs (areas, priorities, assignments, volunteer teams, …)
  api/cron/           Vercel cron (daily PM generation)
  api/roadmap/        Product Manager bot: propose items, move to any column, add a note (Bearer OLB_ROADMAP_BOT_TOKEN)
lib/                  Server actions, Supabase clients, auth, notifications, search
supabase/migrations/  Schema + RLS, applied in numeric order: 0000_baseline.sql
                      (the whole schema), then newer migrations
supabase/migrations-archive/
                      Migrations the baseline replaced (reference only, never applied)
```

## Deployment

Hosted on Vercel via the GitHub integration — pushes to `main` deploy to
production; PRs get preview deployments. Set the environment variables from
`.env.example` in the Vercel project settings, and set the same `CRON_SECRET`
there so the scheduled PM-generation job (`vercel.json` → `/api/cron/pm-generate`)
is authenticated. Set `OLB_ROADMAP_BOT_TOKEN` there too if the Product Manager
assistant should be able to propose items on `/portal/roadmap` (see below).
Remember to apply new `supabase/migrations/` to the production
database before (or together with) a deploy that depends on them.

## Roadmap bot API

Jeff's Product Manager assistant can propose items on `/portal/roadmap` through
`/api/roadmap/items`, and move them to any board column (including Parked, a
skip, or backwards) with `PATCH /api/roadmap/items/<id>`. Super-admins still
edit the board in the portal. POST is insert-only: it always saves
`status: "proposed"` with no `released_on` (any status in the body is ignored).

Set `OLB_ROADMAP_BOT_TOKEN` to a long random string in `.env.local` and in the
Vercel project settings. Send it as `Authorization: Bearer <token>`. A missing
or wrong token returns 401.

**GET** `/api/roadmap/items` — non-deleted items as `{ items: [{ id, title, area, status }] }`, so the bot can skip duplicates.

```bash
curl -sS https://<site>/api/roadmap/items \
  -H "Authorization: Bearer $OLB_ROADMAP_BOT_TOKEN"
```

**POST** `/api/roadmap/items` — add one item. Body: `{ "title", "description", "area" }`.

```bash
curl -sS https://<site>/api/roadmap/items \
  -H "Authorization: Bearer $OLB_ROADMAP_BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Push notifications","description":"On your phone.","area":"Portal"}'
```

`area` must be one of Portal, Website, Registration, Payments, HS Schedule, or
Slack & email (same list as `lib/roadmap/model.ts`). Title and description use
the same length checks as the board form. Bad input is a 400 with `{ "error": "…" }`.

**PATCH** `/api/roadmap/items/<id>` — move one existing item to any column the
board supports (`proposed`, `planned`, `progress`, `preview`, `released`,
`parked`), and/or add a `note`. Body is `{ "status" }` and optional
`preview_url` and `note`. `preview_url` is required when landing on Preview
without a link already on the card. `note` is trimmed, at most 2000
characters, and stored on the card's history (Bot, from column, to column,
note, when) in the same database transaction as the move. A same-column
PATCH with no note is a no-op (no history row). An unknown column is 400
`{ "error": "Pick a column." }`. Any other field is 400. Unknown id is 404.
If the card's column changed since it was read, 409. There is no DELETE.

```bash
curl -sS -X PATCH https://<site>/api/roadmap/items/<id> \
  -H "Authorization: Bearer $OLB_ROADMAP_BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"parked","note":"Waiting on the vendor."}'
```

## CI

`.github/workflows/ci.yml` runs type-check and a production build on every PR
and push to `main`. Lint runs informationally (the existing codebase has
pre-existing eslint findings); tighten it to a hard gate once that baseline is
cleaned up.
