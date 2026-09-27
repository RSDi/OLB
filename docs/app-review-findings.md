# OLB App Review — Findings

Companion to [app-review-plan.md](app-review-plan.md). One section per review track.

---

## Track 3 — UX Walkthrough (2026-06-11)

**How it was done:** played two personas against the local dev server at phone width (375px) — "Pat", a brand-new non-technical member (register → pending → first login → Building Use wizard → track my request), and a committee admin (approve the member, work the review queue, approve the request, PM screens). Slack env vars were disabled locally during the walkthrough; all test data (2 auth users, 2 member rows, 1 request + review log) was deleted afterward and verified gone. Real congregation data was untouched.

**Verdict:** the core member journey is *genuinely good* — the signup holding pattern, the request wizard, and the committee review queue all deliver the "walk them through it" vision with warm, plain-language copy. The friction is concentrated in three places: one broken mobile layout (PM detail), one operational time bomb (Supabase's built-in email rate limit), and a cluster of "what happened to my request?" feedback gaps.

### Friction log (ranked by how badly it confuses a non-technical member)

| ID | Rank | Finding |
|----|------|---------|
| U1 | **P1** | **PM task detail page is broken at phone width** — the content column collapses to ~50px (one word per line) with the details card overlapping it. This is exactly the screen the vision wants volunteers using at the furnace with a filter in one hand. Two-column layout doesn't collapse on mobile. |
| U2 | **P1** | **Supabase's built-in mailer rate limit will hit real members.** During the walkthrough, the password-reset email was refused with "email rate limit exceeded" (the default mailer allows only a handful per hour) — and that raw string is shown to the member verbatim. Before real usage: configure custom SMTP (Resend) in Supabase Auth settings, and translate auth errors into friendly copy. |
| U3 | **P2** | **A member can't tell their request was approved.** After committee approval, the member's list still showed status "Open" (the Approved chip existed only on the detail page) — and a *declined* request vanished from their list entirely. *(Correction to the original walkthrough note: the decision email did already use the member's account email — Pat saw nothing locally because Resend is unset in dev; the email gap was public submissions only, which had no fallback to the wizard's contact field.)* **Fixed in the A1 build (2026-06-11):** decision chips on the member's list incl. Declined, public-submission email fallback, and committee voting with notify-on-decision. |
| U4 | **P2** | **Tasks queue is a desktop table on phones** — description wraps one word per line and the STATUS column is invisible unless the member discovers horizontal scroll. Needs a card layout at narrow widths (the Review queue already does this well — copy it). |
| U5 | **P2** | **Birthdays opens at January — in June.** "Who has birthdays this month" (the stated use case) requires scrolling through five months. Default to the current month. |
| U6 | **P2** | Member dashboard/queue KPIs say "0 Open" directly above the request the member just submitted (pending-review isn't counted). Mixed signal — count it or label it. |
| U7 | **P3** | Vocabulary drift: nav says "Make a Request" and "Tasks & Projects", the dashboard button says "New maintenance request", and "View my requests" lands on a page titled "Tasks & Projects". Pick one word for the member-facing concept. |
| U8 | **P3** | Wizard review step shows "REQUESTED BY: OLB" (the affiliation choice, not the person) and raw ISO dates ("2026-07-18"). Show "Pat Walkthrough (member) · 402-555-0142" and "July 18, 2026". |
| U9 | **P3** | Birthdays: "turns 0" for infants; imported name casing ("McQUINN"). |
| U10 | **P3** | Email confirmation is a third hurdle before committee review (confirm email → wait for approval → sign in). Committee approval is already the gate — consider disabling Supabase email confirmation to cut signup drop-off. |
| U11 | **P3** | Dave's Idea page copy promises routing to "Things, Reminders, Notion, Slack, HubSpot" — well ahead of what's wired. Trim to what works today. |
| U12 | **P3** | Member approval is **super_admin-only** (Members tab invisible to `admin` role), but the transcript says any building-committee member should approve members. Confirm intent; likely widen to staff. Also: approving gives the new member no notification (relates U3). |
| U13 | **P3** | Jargon in member-facing nav: "PM" (means nothing to a volunteer — "Upkeep"/"Recurring maintenance"), "Playbooks" (consider "How-tos" or "Documents"). |
| U14 | **P3** | A11y nits: the "Forgot password?" control reads oddly in the accessibility tree (labeled "PASSWORD ••••••••"); the Settings nav item reads "1 Settings 1" when the pending badge shows. |

### What's genuinely good (verified, keep it this way)

- **Signup → holding pattern → approval** — "Request submitted… A building committee member will review it and follow up." Calm, jargon-free, exactly the transcript's intent. Mismatched-password error is plain English.
- **The Building Use wizard is the vision, delivered** — 8 one-tap steps: "What are you planning?" → tailored tracks (Party, Wedding, Sports, Class, "Just need a room") → multi-select spaces with the real room names (Gym, Room 201, Dining area) → native date/time pickers → "About how many people? A rough number is perfectly fine." → needs checklist → access & cleanup planning → review → "Thanks, Pat! The building committee will review your request and follow up."
- **The committee Review queue** — mobile-friendly cards with smart derived chips ("Children" because 12 kids are coming, "Outside group", "Recurring"), a "Things to weigh" checklist (insurance, supervision of kids, who locks up, fits our mission), approve/decline with required reason on decline, decision audit trail.
- **Role scoping is right everywhere**: members see 6 nav items (no Review/PM/Settings/Contacts leakage); pending members are held at the door; the column-guard trigger even stopped my service-role attempt to escalate a role (defense-in-depth, working).
- **Areas are current** — Gym, 201 Room, HVAC all present in live data (the plan-doc concern was stale).
- Good empty states throughout ("You haven't submitted any requests yet.").

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
| S9 | Med | **Meeting audio is stored in public Vercel blobs.** URLs are unguessable but never expire and require no auth — committee meeting recordings could discuss finances or personnel. AssemblyAI needs to fetch the URL, which is why it's public today. | ✅ **Fixed 2026-06-12 (B6)** — new recordings go to a private Supabase bucket with 1-hour signed playback URLs; AssemblyAI gets the bytes directly (its own private upload_url). Pre-B6 blobs remain public until re-recorded or deleted. |
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
