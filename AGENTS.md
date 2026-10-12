<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Supabase RLS policies

Wrap role-helper calls in a subquery: `using ((select public.is_staff()))`, never a bare `using (public.is_staff())`. Same for `is_super_admin()`, `is_approved()` and `auth.uid()`. A bare call re-runs for every row a query touches (and each helper does its own lookup against `members`); the wrapped form runs once per query. Migrations 0080, 0085 and 0086 fixed every existing policy, so write new ones wrapped. Helpers that take a column, like `owns_task(parent_id)`, depend on the row and can't be wrapped.
# User Guide and page help

`lib/help/guide.ts` is the single source of truth for in-app help: the User Guide page (sidebar → User Guide, `/portal/guide`) and the top-bar "i" panel on every page both read it. Keep it current as features ship. Any change people can see (a new page, a renamed button or tab, new behavior, a preview feature released to everyone) updates the matching guide section in the same commit, and bumps `GUIDE_UPDATED`. Write for the people who use the page: parents, coaches and the board. Plain words, button labels quoted exactly as the UI shows them. A feature still in preview (`lib/auth/feature-preview.ts`) either stays out of the guide or gets a section marked `preview: true`, which only the preview accounts see; nobody else reads about it. Set each section's `audience` (`everyone`, `staff`, `super_admin`) so nobody reads about controls they don't have. Give a page its "i" help by listing its route in a section's `routes`. `tests/unit/help-guide.test.ts` fails when a released portal page has no section. When you release a preview page, take it off that test's `PREVIEW_ROUTES` and write its section. For a one-line hint on a single form field, use the `help` prop on `Input`/`Select` (or `<HelpTip>`), and keep those in step with the guide too. Guided tours (`lib/help/tours.ts`) retell guide sections as Next/Back callouts pointed at elements marked `data-tour="…"`: rename or move a button and update its tour step too; `tests/unit/help-tours.test.ts` fails when a step points at a `data-tour` no component carries.
# Ship it

When the user says "ship it" (or "push to prod" / "land on main"), Claude owns the mechanics; the user's job is to start an idea, then say *ship it*. `main` is production: merging deploys the site (Vercel) and runs new migrations (`.github/workflows/migrate.yml`).

1. **Show the SQL, get an OK.** If the branch adds `supabase/migrations/*.sql`, paste each new file's full SQL in the chat and wait for the user's go-ahead: merging applies it, and it's the one step that can't be undone. Additive files run automatically on merge, usually before Vercel finishes building. A file that drops a table or column (or starts with `-- DESTRUCTIVE`) must run AFTER the deploy that stops using it: the Action refuses it on merge, so once the deploy is live run Actions → Migrate → Run workflow with "Plan only" unticked and "Allow destructive" ticked. Put the reverse script in `supabase/removal/`, never in `migrations/`.
2. **Guide and tours.** Anything people can see is already in `lib/help/guide.ts` (see "User Guide and page help"); check before merging.
3. **Merge.** Open a PR into `main` if there isn't one, wait for CI to pass, then squash-merge it. If `main` has moved and conflicts, merge `main` into the branch and resolve; never force-push.
4. **Confirm.** Check the Migrate run on the merge commit went green (GitHub MCP `actions_list` / `get_job_logs`) before calling it shipped. If the Action can't run, fall back to giving the SQL as a copy-paste block for the Supabase SQL editor, and record it afterwards (`npm run db:migrate -- --baseline-up-to <file>`), or the next run will stop on the gap.

Migrations are recorded in `public.schema_migrations`. Never edit a file that's already applied; write a new one. Number new files after the highest in `supabase/migrations/`.
