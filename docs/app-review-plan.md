# MCC App Review — Plan & Roadmap

**Date:** June 11, 2026
**Inputs:** Jeff's recorded vision walkthrough (Jun 11 meeting) + interview decisions (same day)
**Baseline:** `main` @ `2f43bda` — the consolidated line of truth (tasks-projects-intake + daves-idea fully merged)

---

## Executive summary — review complete (2026-06-11)

All four tracks ran and closed in one day. The app is **substantially closer to the vision than assumed going in**: the request wizard, committee review queue, holding-pattern signup, areas, PM system, and the ReelNotes backbone (transcription → action items with suggested assignee/helpers) are built and good. Detailed findings: [app-review-findings.md](app-review-findings.md).

**Shipped during the review (live on prod, verified):** branch consolidation to `main`; security hardening — approved-member RLS gates, soft-delete-aware role helpers, webhook authentication, security headers (migration 0049 + commit `cbc2c35`); WAF rate-limit rule staged.

**Phase A: COMPLETE (2026-06-12).** All ten items shipped and verified live: committee voting with auto calendar booking, member-visible decisions, email-code sign-in, mobile fixes, vendors/budgets/reorder alerts, security hardening, action guards, and a schema-contract test suite. The only outstanding piece is Jeff-side: custom SMTP in Supabase (and the optional `{{ .Token }}` template edit). Next build phase when ready: **Phase B — ReelNotes evolution**.

**Decisions — answered 2026-06-11:**
| # | Decision | Outcome |
|---|---|---|
| D1 | Who can approve new members | **Any committee admin** — built into the A1 changes (migration 0050 + Members tab for all staff; roles/edit/remove stay super-admin) |
| D2 | Email confirmation at signup | **Dropped** ✅ — verified 2026-06-11 (`mailer_autoconfirm: true`). New signups get an instant session and land straight on the committee-review holding screen; one less hurdle for non-technical members. (First attempt landed on the wrong Supabase project — RSDi Operations — caught and corrected.) |
| D3 | Staged firewall rule | **Published** — rate limit live on `/assistance/*` |

---

## Decisions locked in the interview

| Topic | Decision |
|---|---|
| Branches | `main` is the single line of truth; tasks-projects-intake and daves-idea merged in and pushed |
| Review scope | All four tracks: vision-gap audit, code & security review, UX walkthrough, schema/drift audit |
| Committee voting | **4-of-7 simple majority, instant.** Yes = optional note. No = required note. 4 yes → approved + requester auto-notified. 4 no → declined. |
| Login codes | **Email codes first** (6-digit OTP with hand-holding UI). SMS stays on the roadmap; build the UI so "text me a code" slots in later. |
| Prod drift | I audit the live DB, produce an ordered paste-ready SQL bundle + deploy checklist. **Jeff applies** in the Supabase SQL editor. Deploys stay manual (`vercel --prod` from main). |
| UX walkthrough | Local dev server, desktop + phone widths. No prod interaction. |
| Naming | The recording feature is **ReelNotes** (one word, "Reel" as in film reel) |

---

## Where the app stands vs. the vision

### Built and matching the vision
- **Three-tier roles** — super_admin (Jeff, Mike, Dave) / admin (building committee) / member, with the pending → approved holding pattern and super-admin approval queue
- **Wizard intake, not web forms** — 5 tailored request tracks including the Building Use wizard; public (no-login) intake also funnels through it
- **Committee review queue** — needs-review / approved / declined tabs with a decision audit trail (single-reviewer today; voting is the gap)
- **Areas, Things-style** — areas with owner/helper assignments (Kitchen, Main Meeting Room, Exterior/Grounds, etc.)
- **Tasks & Projects** — the maintenance reframe: categorized tasks, projects grouping tasks, comments, assignments, priorities, soft-delete
- **Preventative maintenance** — recurring templates (monthly/weekly/after-completion), per-step checklists, per-asset sub-records (the 9-HVAC scenario), cron auto-generation, calendar view
- **Supplies inventory** — on-hand counts, reorder thresholds, atomic decrement tied to PM/task usage, low-stock dashboard panel
- **Directory** — households, birthdays by month, anniversaries, memorials, relationships, phone list
- **Events calendar** with categories
- **Playbooks** — versioned operations docs (the natural home for bylaws/corporation documents)
- **Slack notifier** — live against MCC Saints (#C0B7CV6T2MP), fires on new tasks/requests (one-way)
- **ReelNotes backbone (Dave's Idea)** — in-app recording upload → AssemblyAI transcription with speaker labels → Claude extracts title + action items **with suggested assignee and suggested supporters** ("Matt takes it, Corey helps" works today) → completion email. Reframe Phase 3 wired Dave's Idea into Tasks/Projects.

### Gaps (vision says / app does)

| # | Vision | Current state |
|---|---|---|
| G1 | All 7 committee members vote; 4-of-7 auto-approves; "no" requires a reason; requester auto-notified | Single staff member approves/declines |
| G2 | Dead-simple login + code-based reset for non-technical members | Email/password + Google/Apple OAuth + email reset *link*; no code flow, no guided walkthrough |
| G3 | Vendors assigned to tasks, budgets, auto-notify on reorder threshold | No vendors, no budgets; low stock shows on dashboard but notifies no one |
| G4 | Approved building use lands on the events calendar | Approval doesn't create an event |
| G5 | Trustees named/listed (member-level access only) | No trustee designation |
| G6 | Quarterly financial summaries visible to members; details gated to committee/super-admins | Nothing built |
| G7 | Slack replies in a thread feed back into the task history | One-way notifications only |
| G8 | ReelNotes: video, timestamp-linked tasks, record from any task context, Things export | Audio-only; no video, no timestamp linking, no Things export |
| G9 | Birthday slideshow for the TVs | Not built (explicitly "eventually") |
| G10 | Building access system integration | Explicitly future — out of scope |
| G11 | Podcast/messages on the public site | Hardcoded sample episodes, no real feed |

---

## The four review tracks

### Track 1 — Schema & drift audit — ✅ DONE 2026-06-11 (drift portion)
**Result: zero drift.** Read-only PostgREST probes confirmed every fingerprint of migrations 0036–0048 is live in the DB (tables volunteer_teams, contacts, daves_idea_*, task_categories, projects, task_review_log; columns owner_member_id/priority/supporters on action items, review_status+details on maintenance_requests; search_global rpc; the 0047 "Building Use" seed row). 0040 is RLS-policy-only and can't be probed via REST — it's idempotent, safe to re-run if ever in doubt. **No SQL bundle needed.**

**Prod deploy is also current:** a production deploy ran the morning of Jun 11; the live site serves the daves-idea/intake routes (probe: GET `/api/daves-idea/transcription-webhook` → 405 = route exists), and the intake-only migrations being applied corroborates it's the intake tip — which is content-identical to consolidated `main` (empty `git diff`).

Still open from this track (folded into Track 2): migration-set audit — naming drift, FK/index coverage, RLS coverage per table.

### Track 2 — Code & security review — ✅ DONE 2026-06-11
Full results in **[app-review-findings.md](app-review-findings.md)** (15 findings, S1–S15). Headline: posture fundamentally sound; fixed in this pass — pending-member read exposure (S1), soft-deleted staff retaining powers (S2), open ticket INSERT (S3), unauthenticated transcription webhook (S4/A5), plus four small hardenings. Jeff's to-do: apply migration 0049, set `ASSEMBLYAI_WEBHOOK_SECRET` in Vercel, deploy. New backlog from the review: WAF rate limit on public intake (→ A6), `requireStaff()` guards across server actions (→ A7), private blobs for meeting audio (→ B6), tests for auth/intake paths.

### Track 3 — UX walkthrough — ✅ DONE 2026-06-11
Full friction log (U1–U14) in **[app-review-findings.md](app-review-findings.md)**. Headline: the member journey (signup → holding pattern → wizard → committee review) is the vision delivered, with warm plain-language copy throughout. Two P1s: the PM task detail layout is broken at phone width (the volunteer-on-a-phone screen), and Supabase's built-in mailer rate limit will block real signups/resets until custom SMTP is configured. P2 cluster: members can't see/hear that their request was approved (status shows "Open", no email to account address), tasks queue is a desktop table on phones, birthdays opens at January. Areas list concern was stale — Gym/201 Room/HVAC exist in live data. New backlog: A8 (mobile layouts), A9 (custom SMTP + friendly auth errors); U3/U12 fold into A1's notification work.

### Track 4 — Vision-gap audit → final roadmap — ✅ DONE 2026-06-11
Tracks 1–3 findings merged into the sequenced backlog below (Phase A reordered by value/dependency, A10 added for tests, open decisions surfaced in the executive summary). The G-table above stands as the point-in-time vision map; the backlog carries status from here.

---

## Backlog (prioritized)

### Phase A — next up, in execution order

| Seq | ID | Item | Size | Status / scope |
|---|---|---|---|---|
| 1 | A6 | ~~**Publish the firewall rule**~~ (S10) | — | ✅ Published 2026-06-11 (D3). |
| 2 | A9 | **Auth email deliverability** (U2, U10) | small | Code side ✅ **SHIPPED 2026-06-11** — `friendlyAuthError()` translates raw Supabase errors (rate limit, bad credentials, expired links) on login/register/reset. ⏳ Jeff-side: custom SMTP in Supabase (smtp.resend.com:465, user `resend`, Resend API key) + D2 confirm-email toggle. |
| 3 | A8 | **Mobile & quick-win UI fixes** (U1, U4, U5, U9) | small | ✅ **SHIPPED & VERIFIED 2026-06-11** — all four two-column detail pages (tasks/PM/assets/contacts) stack on phones; tasks queue renders cards at phone width with decision chips visible; birthdays opens at "June — this month" wrapping into next year with correct ages; "turns 0" gone. |
| 4 | A1 | **Committee voting + member-visible decisions** (G1, U3, U12) | large | ✅ **SHIPPED & VERIFIED LIVE 2026-06-11.** Migration 0050 applied; deployed to prod. End-to-end test (throwaway committee): no-vote with required note → change-to-yes → second yes hit the live-computed majority → instant Approved chip, votes + audit logged, member's list shows the decision. D1 verified: a plain `admin` worked the Members queue and approved a pending member. |
| 5 | A4 | **Approved building use → calendar event** (G4) | small | ✅ **SHIPPED & VERIFIED LIVE 2026-06-11** — deciding vote auto-created the calendar event (date/time/space, `source_ticket_id` link) in the e2e test. |
| 6 | A2 | **Email-code login** (G2) | medium | ✅ **SHIPPED & VERIFIED LIVE 2026-06-11.** "Email me a sign-in code" on the login page (large-type code input, resend cooldown, plain-language copy); "Forgot password?" rides the same code flow → set-new-password page; full happy path verified end-to-end (code → signed in → /portal). Dead Google/Apple OAuth buttons removed (providers disabled in Supabase; restore when configured). SMS slots in beside the email-code button later. ⏳ Optional Jeff step: add `{{ .Token }}` to the "Magic link or OTP" email template so members see a code; until then the emailed button also signs them in. |
| 7 | A3 | **Vendors, budgets, reorder alerts** (G3) | medium-large | ✅ **SHIPPED & VERIFIED LIVE 2026-06-11.** Vendors = the existing contacts (already attachable to tasks); supplies link a reorder vendor + note; crossing-only low-stock alerts to email + Slack naming the vendor (verified firing exactly once); project budgets + task costs with Budget/Spent/Remaining on the project page (verified $100 − $25 = $75). Migration 0051 applied. |
| 8 | A7 | **`requireStaff()` guards in server actions** (S11) | medium, mechanical | ✅ **SHIPPED 2026-06-11.** `lib/auth/guards.ts` (requireStaff/requireSuperAdmin) applied across ~58 mutations in 16 action files; hard-deletes gated super-admin; member/anon/self-checked actions untouched. Staff path verified live through a guarded action. |
| 9 | A10 | **Smoke tests: schema contract + units** (S14) | small | ✅ **SHIPPED 2026-06-11.** `npm test` (node:test, zero deps): schema-contract probes every table+column the code uses against the live DB — the check that would have caught the broken building form (run locally after every migration, before deploying); unit tests for friendlyAuthError (incl. the ordering regression), low-stock crossing, and voting majority math. CI on Node 24 runs the units; contract self-skips there. The contract test corrected 3 stale schema assumptions on its first run. |
| — | A5 | ~~**Webhook auth fix**~~ | — | ✅ Shipped & verified on prod 2026-06-11. |

### Phase B — ReelNotes evolution (G7, G8)
| ID | Item |
|---|---|
| B1 | ✅ **DONE 2026-06-12.** Audit found the loop largely built: spoken-name→member matching (nicknames + phonetics, refuses ambiguity), one-click confirm chips for suggested owner AND helpers, manual pickers, Things export, project conversion. Shipped the missing piece: supporters + non-staff owners now survive conversion into each task ("Helping: …" / "Owner: …" lines; staff owners take the assignee slot). Verified live end-to-end ("Jeff"/"Cory" → matched → confirmed → task assigned w/ helper named). Also trimmed the U11 overpromise copy. |
| B2 | ✅ **SHIPPED 2026-06-12** (dormant until 0053 + Slack app config). Signed /api/slack/events receiver (HMAC, replay-proof, fail-closed); notifier stores each message's thread anchor on the ticket; replies attribute via Slack profile email → member, else kept as "Name (via Slack)". Verified with signed synthetic requests (handshake/401s/skips). ⏳ Jeff: apply **0040+0052+0053**, then Slack app: copy Signing Secret → `vercel env add SLACK_SIGNING_SECRET production`; add scopes channels:history + users:read + users:read.email → Reinstall; Event Subscriptions → URL `https://millard-community-church.vercel.app/api/slack/events` → subscribe `message.channels` → Save. |
| B3 | ✅ **SHIPPED 2026-06-12** (awaiting migration 0052 for the link itself). ReelNotes card on every task (staff): record in place; the recording links to the task, the pipeline posts title + action items + listen-link into the task's comment thread on completion, and the task lists its recordings. Pre-0052 the upload gracefully saves unlinked (verified live). ⏳ Jeff: apply **0040 + 0052**; comment-on-completion gets its first proof with the next real prod recording. |
| B4 | Video capture + timestamp-linked action items ("complete video linking") |
| B5 | ✅ Already built (found during B1 audit): one-tap + batch Things export via URL scheme, with owner/helpers in the notes and a deep link back to the recording. |
| B6 | ✅ **SHIPPED & VERIFIED 2026-06-12.** New recordings: private `reel-notes-audio` Supabase bucket + direct byte upload to AssemblyAI — no public URL ever exists. Signed 1-hour URLs for playback (loader + upload response); polling preserves them; pre-B6 blobs pass through. Verified: marker in DB, signed fetch 200, unsigned 400, storage removal works. **Found: migration 0040 was never applied to prod** (the one Track 1 couldn't probe) — recordings restore/delete-forever in Settings → Deleted has been silently empty. ⏳ Jeff: apply 0040. |

### Phase C — later
| ID | Item |
|---|---|
| C1 | Trustees: directory designation + listing (member-level access only) (G5) |
| C2 | Financial reports: quarterly summaries visible to members; details gated to committee/super-admins (G6) — likely document-upload with visibility levels first, structured data later |
| C3 | Birthday slideshow for TVs (G9) — weekly auto-generated, fed by the directory |
| C4 | Real podcast/messages feed on the public site (G11) |
| C5 | Building access integration (G10) — parked |
| C6 | Playbook attachments: wire the upload UI to the existing schema |
| C7 | Copy/polish batch from the walkthrough: wizard review wording & dates (U8), birthdays "turns 0" (U9), KPI counts vs pending-review (U6), vocabulary unification (U7), nav jargon (U13), a11y nits (U14), trim Dave's Idea overpromise copy (U11) |

---

## Pre-review seed list — final disposition
- ~~Transcription webhook unverified~~ → fixed and live (A5)
- ~~Prod drift~~ → none; DB fully migrated, deploy current (Track 1)
- ~~Historical building-form bug~~ → already fixed in current code; regression test queued as A10
- ~~Seeded areas lack Gym / Room 201~~ → stale; live data has Gym, 201 Room, and HVAC (Track 3)
- Playbook attachments: schema exists, UI upload not fully wired → C6
- Public messages page uses hardcoded sample episodes → C4
