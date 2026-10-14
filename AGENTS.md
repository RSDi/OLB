<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Supabase RLS policies

Wrap role-helper calls in a subquery: `using ((select public.is_staff()))`, never a bare `using (public.is_staff())`. Same for `is_super_admin()`, `is_approved()` and `auth.uid()`. A bare call re-runs for every row a query touches (and each helper does its own lookup against `members`); the wrapped form runs once per query. Migrations 0080, 0085 and 0086 fixed every existing policy, so write new ones wrapped. Helpers that take a column, like `owns_task(parent_id)`, depend on the row and can't be wrapped.
# User Guide and page help

`lib/help/guide.ts` is the single source of truth for in-app help: the User Guide page (sidebar → User Guide, `/portal/guide`) and the top-bar "i" panel on every page both read it. Keep it current as features ship. Any change people can see (a new page, a renamed button or tab, new behavior, a preview feature released to everyone) updates the matching guide section in the same commit, and bumps `GUIDE_UPDATED`. Write for the people who use the page: parents, coaches and the board. Plain words, button labels quoted exactly as the UI shows them. A feature still in preview (`lib/auth/feature-preview.ts`) either stays out of the guide or gets a section marked `preview: true`, which only the preview accounts see; nobody else reads about it. Set each section's `audience` (`everyone`, `staff`, `super_admin`) so nobody reads about controls they don't have. Give a page its "i" help by listing its route in a section's `routes`. `tests/unit/help-guide.test.ts` fails when a released portal page has no section. When you release a preview page, take it off that test's `PREVIEW_ROUTES` and write its section. For a one-line hint on a single form field, use the `help` prop on `Input`/`Select` (or `<HelpTip>`), and keep those in step with the guide too. Guided tours (`lib/help/tours.ts`) retell guide sections as Next/Back callouts pointed at elements marked `data-tour="…"`: rename or move a button and update its tour step too; `tests/unit/help-tours.test.ts` fails when a step points at a `data-tour` no component carries.

# Local development

Node.js 24 is installed at `/usr/local/bin/node`, matching CI and Vercel. Cloud Agent shells often resolve `node` to an older binary first. Run `export PATH="/usr/local/bin:$PATH"` before `npm`, `npx`, or `node`.

The portal uses a local Supabase stack. `supabase/config.toml` turns on the experimental stack (`[experimental] stack = true`) so `supabase start --runtime native` runs Postgres, Auth, and the API as processes, without Docker. The API is `http://127.0.0.1:54321` and Postgres is `127.0.0.1:54322`. Studio, analytics, and edge functions are off.

On a Cloud Agent boot, start brings that stack up, writes `.env.local` from `supabase status --env` (single quotes stripped; the schema tests' parser does not remove them), and runs `npm run dev` on port 3000. `.env.local` is gitignored. Resend, Slack, Blob, and AssemblyAI stay unset, and the app skips those features.

Sign in as `admin@example.com` / `local-dev-password` (a Super-admin on the local database). Recreate that account with `npm run create-admin -- --password 'local-dev-password' admin@example.com`.

`npm test` runs the schema-contract probes when `.env.local` is present. `npm run type-check` and `npm run build` match CI. `npm run lint` still reports existing findings and is not a gate.
