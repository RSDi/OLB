<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Supabase RLS policies

Wrap role-helper calls in a subquery: `using ((select public.is_staff()))`, never a bare `using (public.is_staff())`. Same for `is_super_admin()`, `is_approved()` and `auth.uid()`. A bare call re-runs for every row a query touches (and each helper does its own lookup against `members`); the wrapped form runs once per query. Migrations 0080, 0085 and 0086 fixed every existing policy, so write new ones wrapped. Helpers that take a column, like `owns_task(parent_id)`, depend on the row and can't be wrapped.

# Supabase table grants (Data API)

From 2026-10-30, new tables, sequences, and functions in schema `public` no longer get automatic Data API grants. Without an explicit GRANT, supabase-js/PostgREST returns `permission denied`. Existing objects keep whatever grants they already have. `*_data_api_table_grants.sql` backfilled post-baseline tables that had never been granted.

Every migration that creates a public table, sequence, or function includes the grants in the same file:

```sql
grant select, insert, update, delete on public.<t> to authenticated, service_role;
grant usage, select on sequence public.<s> to authenticated, service_role;
grant execute on function public.<f>(...) to authenticated, service_role;
```

`serial` / `bigserial` / identity columns create a backing sequence (`<table>_<column>_seq`); grant `usage, select` on that too, to `anon`, `authenticated`, or `service_role`. Trigger functions (`returns trigger`) do not need a Data API execute grant. Add `grant select on public.<t> to anon` only when anonymous reads are needed (the public website: `site_menu_items` and `site_content`). RLS still decides which rows a role can see; grants only let PostgREST reach the object. Sequence and function grants must name at least one of `anon`, `authenticated`, or `service_role` — a grant to `postgres` alone does not count.

Service-role-only objects (hashed secrets, OAuth tokens, pairing codes) grant `service_role` and do not grant `authenticated` or `anon`. The app reaches those through `createAdminClient()` after its own permission check.

`tests/unit/migration-table-grants.test.ts` (CI step "Public table Data API grants") fails migrations numbered 0154 and later that create a public table, sequence, or function without a matching grant.
# User Guide and page help

`lib/help/guide.ts` is the single source of truth for in-app help: the User Guide page (sidebar → User Guide, `/portal/guide`) and the top-bar "i" panel on every page both read it. Keep it current as features ship. Any change people can see (a new page, a renamed button or tab, new behavior, a preview feature released to everyone) updates the matching guide section in the same commit, and bumps `GUIDE_UPDATED`. Write for the people who use the page: parents, coaches and the board. Plain words, button labels quoted exactly as the UI shows them. A feature still in preview (`lib/auth/feature-preview.ts`) either stays out of the guide or gets a section marked `preview: true`, which only the preview accounts see; nobody else reads about it. Set each section's `audience` (`everyone`, `staff`, `super_admin`) so nobody reads about controls they don't have. Give a page its "i" help by listing its route in a section's `routes`. `tests/unit/help-guide.test.ts` fails when a released portal page has no section. When you release a preview page, take it off that test's `PREVIEW_ROUTES` and write its section. For a one-line hint on a single form field, use the `help` prop on `Input`/`Select` (or `<HelpTip>`), and keep those in step with the guide too. Guided tours (`lib/help/tours.ts`) retell guide sections as Next/Back callouts pointed at elements marked `data-tour="…"`: rename or move a button and update its tour step too; `tests/unit/help-tours.test.ts` fails when a step points at a `data-tour` no component carries.
# Roadmap

Every piece of development work has a card on the Roadmap board (`/portal/roadmap`), and the card follows the work. Use `npm run roadmap` (`scripts/roadmap.ts`; needs `OLB_ROADMAP_BOT_TOKEN` in `.env.local`). Run `npm run roadmap -- list` before you start, and reuse a card that already covers the work instead of adding a second one.

- **Proposed**: an idea you suggest, or one Jeff mentions without asking for it to be built, goes on as `propose`. Don't build it. Only Jeff's **Approve** moves it to Planned.
- **Planned**: approved, waiting to be built. Jeff asking for something directly in chat ("build it", "set it up") is approval too: add the card if there isn't one, and go straight to In progress with a note saying he asked in chat.
- **In progress**: `move <id> progress --note "…"` when you start. Name the branch in the note.
- **Preview**: `move <id> preview --preview <url>` once the PR's Vercel preview is up. Use the PR's preview URL.
- **Released**: `move <id> released` once the PR is merged to main. The date fills itself in.
- **Parked**: work set aside or dropped: `move <id> parked --note "why"`.

A card's title and description show on the families' share link: write them for parents, in plain words, with no code or file names. Notes and history stay with the board. Changes that nobody would notice (a refactor, a test, a dependency bump) don't need a card. If the token isn't set, say so in your wrap-up and list the moves you couldn't make.
