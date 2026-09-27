# Millard Community Church — Member Portal

Internal portal for Millard Community Church: member directory, facilities &
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

4. **Bootstrap the first admin**

   Set `ADMIN_EMAILS` to your address before signing up; the first matching
   account is promoted to super-admin so you can approve other members.

   Or create admins who sign in with a password straight away (needs
   `.env.local` with the service-role key):

   ```bash
   npm run create-admin -- --password 'temporary-password' you@example.com
   ```

   They're Super-admins, or Building Committee with `--role admin`. Re-running
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

6. **Run the dev server**

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
    maintenance/      Maintenance request tickets + comments
    pm/               Preventive maintenance: templates, instances, calendar, assets
    events/  supplies/  docs/   Events, supplies inventory, playbooks
    settings/         Admin tabs (areas, priorities, assignments, volunteer teams, …)
  api/cron/           Vercel cron (daily PM generation)
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
is authenticated. Remember to apply new `supabase/migrations/` to the production
database before (or together with) a deploy that depends on them.

## CI

`.github/workflows/ci.yml` runs type-check and a production build on every PR
and push to `main`. Lint runs informationally (the existing codebase has
pre-existing eslint findings); tighten it to a hard gate once that baseline is
cleaned up.
