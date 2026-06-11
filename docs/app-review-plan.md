# MCC App Review — Plan & Roadmap

**Date:** June 11, 2026
**Inputs:** Jeff's recorded vision walkthrough (Jun 11 meeting) + interview decisions (same day)
**Baseline:** `main` @ `2f43bda` — the consolidated line of truth (tasks-projects-intake + daves-idea fully merged)

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

### Track 4 — Vision-gap audit → final roadmap
Merge Tracks 1–3 findings with the gap table above into one prioritized backlog (below), adjusting scope for anything the review reveals.

---

## Backlog (prioritized)

### Phase A — next up
| ID | Item | Scope sketch |
|---|---|---|
| A1 | **Committee voting** (G1) | `request_votes` table (request, member, vote, note, timestamps; note required when vote = no). Decision logic: first to 4 wins, instant. Auto-notify requester (email + Slack) on decision. Review queue UI shows vote tally + who hasn't voted; my-requests shows status. Audit trail already exists — extend it. |
| A2 | **Email-code login** (G2) | Supabase email OTP for sign-in and reset; guided, large-type walkthrough UI written for non-technical members; "text me a code instead" stub slot for later SMS. |
| A3 | **Vendors, budgets, reorder alerts** (G3) | `vendors` table; link vendors to supplies (reorder source) and tasks (assigned vendor); budget field per area or per project; threshold-cross notification (email + Slack) when `on_hand` dips below reorder level — the dashboard panel already computes this. |
| A4 | **Approved building use → calendar event** (G4) | On approval, create an `events` row from the request's date/time/space details; link back to the request. |
| A5 | ~~**Webhook auth fix**~~ ✅ done in Track 2 | Shared-secret header on submit + verification in the route. Shipped 2026-06-11; needs `ASSEMBLYAI_WEBHOOK_SECRET` set in Vercel. |
| A6 | **Rate-limit public intake** (S10) | Vercel WAF rate-limit rule on `/assistance/*` — staged 2026-06-11, awaiting `vercel firewall publish`. |
| A7 | **`requireStaff()` guards in server actions** (S11) | Defense-in-depth: TypeScript role check at the top of every staff/super-admin mutation (~50 functions); daves-idea actions model the pattern. |
| A8 | **Mobile layout fixes** (U1, U4) | PM task detail two-column collapse at phone width (P1 — broken today); tasks queue table → cards at narrow widths (Review queue is the model). |
| A9 | **Auth email deliverability** (U2, U10) | Configure custom SMTP (Resend) in Supabase Auth; friendly copy for auth errors ("email rate limit exceeded" → plain English). Decide on disabling email confirmation (committee approval is already the gate). |

### Phase B — ReelNotes evolution (G7, G8)
| ID | Item |
|---|---|
| B1 | Verify/polish name→member matching for suggested assignees & supporters, with the confirm-before-create review step the transcript calls for |
| B2 | Two-way Slack: thread replies feed back into task comments (Slack Events API — needs a public events endpoint) |
| B3 | Record from any task context; notes auto-attach to that task |
| B4 | Video capture + timestamp-linked action items ("complete video linking") |
| B5 | Things export for people who use it (e.g. Dave) |
| B6 | Private Vercel blobs for meeting audio + signed URL for AssemblyAI fetch (S9) |

### Phase C — later
| ID | Item |
|---|---|
| C1 | Trustees: directory designation + listing (member-level access only) (G5) |
| C2 | Financial reports: quarterly summaries visible to members; details gated to committee/super-admins (G6) — likely document-upload with visibility levels first, structured data later |
| C3 | Birthday slideshow for TVs (G9) — weekly auto-generated, fed by the directory |
| C4 | Real podcast/messages feed on the public site (G11) |
| C5 | Building access integration (G10) — parked |

---

## Already-known findings (seed list, to be confirmed/expanded by the review)
- Transcription webhook: no signature verification (v0) — Phase A5
- ~~Prod drift~~ — resolved: DB fully migrated, deploy current (see Track 1)
- **Historical bug, fixed by current code, worth a regression test:** the pre-Jun-11 public building form inserted into a `building_requests` table that never existed — every public submission failed with "Failed to submit request." Current code routes through `createPublicBuildingRequest` → `maintenance_requests` (verified live end-to-end on 2026-05-31). Track 3 should re-verify; Track 2 should consider a test so an intake path can't silently regress again.
- Playbook attachments: schema exists, UI upload not fully wired
- Seeded areas lack Gym / Room 201 (data fix in Settings, confirm in walkthrough)
- Public messages page uses hardcoded sample episodes
