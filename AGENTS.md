<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Supabase RLS policies

Wrap role-helper calls in a subquery: `using ((select public.is_staff()))`, never a bare `using (public.is_staff())`. Same for `is_super_admin()`, `is_approved()` and `auth.uid()`. A bare call re-runs for every row a query touches (and each helper does its own lookup against `members`); the wrapped form runs once per query. Migrations 0080, 0085 and 0086 fixed every existing policy, so write new ones wrapped. Helpers that take a column, like `owns_task(parent_id)`, depend on the row and can't be wrapped.
