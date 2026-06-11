# MCC App Review — Findings

Companion to [app-review-plan.md](app-review-plan.md). One section per review track.

---

## Track 2 — Code & Security Review (2026-06-11)

**How it was done:** three parallel audits (RLS policies across all 49 migrations; authorization on every exported server action; API routes/secrets/middleware/notifications), followed by manual verification of every load-bearing claim against the actual code, plus read-only probes against the live database with the public anon key. Findings below are verified, not just reported — several agent claims were rejected on inspection (noted at the end).

**Verdict in one paragraph:** the security posture is fundamentally sound — RLS is enabled on every table, secrets never reach the browser, notification payloads are properly escaped, the auth callback has no open redirect, and the live anon read surface is exactly one harmless table (`areas`). The real issues were: portal content readable by *pending/denied* signups (the DB didn't enforce the approval gate the UI implies), soft-deleted staff retaining their powers, and the unauthenticated transcription webhook. All three are fixed below.

### Findings & status

| ID | Sev | Finding | Status |
|----|-----|---------|--------|
| S1 | **High** | **Pending-member read exposure.** `events`, `playbooks`, `event_categories`, `playbook_categories`, `task_categories` granted SELECT `to authenticated` with no approval check. Signups are open, so anyone who registers — even if denied — could read the church calendar and all operations playbooks by calling the database API directly. The portal's redirect is app-side only; the 0013 migration comment even assumed the app gate was enough. | **Fixed** — migration 0049 gates reads to approved members/staff |
| S2 | **High** | **Soft-deleted staff keep their powers.** `is_staff()`, `is_super_admin()`, `is_approved()` read the caller's members row without checking `deleted_at`. Soft-deleting an admin (the natural "remove this person" action in the UI) did NOT revoke any database-level permission. | **Fixed** — 0049 redefines all three helpers to require a live row |
| S3 | Med | **Ticket INSERT open to anon + unapproved members.** The `maintenance_insert` policy still had the `anon` arm from when public forms inserted client-side. Both public forms are gone (maintenance redirects into the portal; building use goes through a service-role server action), so anyone scripting the public anon key — or any pending signup — could write rows directly into the task queue. | **Fixed** — 0049 requires approved member or staff |
| S4 | Med | **Transcription webhook unauthenticated** (known going in, A5). Tempered by unguessable AssemblyAI ids, but anyone who learns an id (logs, screenshots, shoulder-surf) could re-trigger paid LLM extraction, overwrite transcript state, or mark recordings failed. | **Fixed** — shared-secret header set on job submit, verified by the route; warns-and-accepts until the env var is set so in-flight jobs don't break |
| S5 | Low | Cron route returned **500 when CRON_SECRET unset**, telling probers the deployment is misconfigured (prod has it set — verified 401 live). | **Fixed** — uniform 401, config error logged server-side |
| S6 | Low | Upload route had no explicit size cap (platform caps bodies at 4.5 MB today, but the limit would silently vanish if uploads move to client-uploads). | **Fixed** — 30 MB guard, 413 |
| S7 | Low | `hardDeleteMember` had a read-then-delete race: a concurrent restore between the soft-delete check and the DELETE would still be overridden. | **Fixed** — DELETE re-asserts `deleted_at is not null` |
| S8 | Low | No security headers configured. | **Fixed** — `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy` on all routes |
| S9 | Med | **Meeting audio is stored in public Vercel blobs.** URLs are unguessable but never expire and require no auth — committee meeting recordings could discuss finances or personnel. AssemblyAI needs to fetch the URL, which is why it's public today. | **Backlog (B-phase)** — switch to private blobs + time-limited signed URL handed to AssemblyAI |
| S10 | Med | **No rate limiting on the public building form.** Each submission fires email + Slack; a script could flood both. (Injection is NOT possible — inputs are escaped, verified S15.) | **Backlog (A-phase)** — Vercel WAF rate-limit rule on `/assistance/*`; zero code |
| S11 | Med | **Server actions rely on RLS alone for role enforcement** (~50 mutations have no TypeScript role check). The DB *does* enforce — this is defense-in-depth, not a live hole. One RLS regression away from exposure, and failures surface as cryptic DB errors instead of "Unauthorized." The daves-idea actions already model the right pattern. | **Backlog (A-phase)** — add `requireStaff()`/`requireSuperAdmin()` guards across actions |
| S12 | Low | Reextract endpoint lets a (staff) account spam paid LLM calls. Staff-gated + ownership-checked already. | Backlog — per-recording cooldown |
| S13 | Low | Public form `eventType`/`space` fall back to raw input instead of rejecting unknown values (output is escaped everywhere, so cosmetic). | Backlog — whitelist-or-reject |
| S14 | Info | **No tests exist**; CI = typecheck + build + non-blocking lint. The silently-broken public building form (Track 1 finding) is exactly the class of bug a smoke test would have caught. | Backlog — auth-path + intake regression tests |
| S15 | Info | `.env.example` was missing the entire ReelNotes section (BLOB token, AssemblyAI key, gateway key). | **Fixed** — documented, incl. new `ASSEMBLYAI_WEBHOOK_SECRET` |

### Audited and clean (verified, not assumed)

- **Secrets**: service-role key, AssemblyAI, Resend, Slack, CRON_SECRET — server-only; nothing leaks into `"use client"` files or `NEXT_PUBLIC_*`; admin client throws if imported without its key
- **Live anon surface** (probed against prod DB): `members`, `events`, `playbooks`, `maintenance_requests`, `contacts`, `daves_idea_recordings`, `task_categories` all return empty to anonymous callers; only `areas` (room names) is readable, intentionally
- **Notifications**: `slackEscape()` and `escapeHtml()` applied to user-controlled fields — no BlockKit/HTML injection
- **Auth callback**: no open redirect (`next` param is allowlisted, all redirects pinned to origin)
- **Middleware**: correctly scoped to `/portal` + `/login`; API routes do their own auth
- **daves-idea mutations**: exemplary ownership pattern (explicit `user_id` check before every admin-client write, two-step soft→hard delete)
- **search_global**: respects approval status; security-invoker so RLS applies
- **Policy hygiene**: WITH CHECK symmetric with USING everywhere; hard-deletes gated to super_admin; audit tables append-only

### Rejected agent claims (for the record)

- "Notification payload injection" — false; escaping is implemented and applied at every interpolation site
- "48+ CRITICAL missing auth checks" — overstated; RLS enforces these. Reframed as the S11 defense-in-depth item
- "BLOB_READ_WRITE_TOKEN already documented in .env.example" — it wasn't; whole section was missing (S15)

### Rollout status (all verified against production, 2026-06-11)

1. ✅ **Migration 0049 applied** (Jeff, SQL editor) — verified: anon INSERT into maintenance_requests now rejected with RLS error 42501.
2. ✅ **`ASSEMBLYAI_WEBHOOK_SECRET` set** in Vercel Production (same value as `.env.local`).
3. ✅ **Deployed** — commits `cbc2c35` (fixes) + `3ec150a` (docs) pushed and live. Verified on prod: security headers present, webhook returns 401 without the secret header, cron returns 401, public building form still serves 200.
4. ⏳ **WAF rate limit (S10/A6) staged, not published** — rule "Rate limit public assistance form": POST `/assistance/*`, max 10 per 10 min per IP, excess → 429. Jeff publishes with `vercel firewall publish --yes` (or discards).

### Code changed in this pass

- `supabase/migrations/0049_security_hardening.sql` (new) — S1, S2, S3
- `app/api/daves-idea/upload/route.ts` — S4 (webhook auth header on submit), S6 (size cap)
- `app/api/daves-idea/transcription-webhook/route.ts` — S4 (verification)
- `app/api/cron/pm-generate/route.ts` — S5
- `lib/auth/member-actions.ts` — S7
- `next.config.ts` — S8
- `.env.example` — S15
- `.env.local` — webhook secret generated (not committed)

Verified: `tsc --noEmit` clean, production build passes, and against the dev server: security headers present on responses, webhook returns 401 without the secret header, cron returns 401 without the bearer token, site renders normally.
