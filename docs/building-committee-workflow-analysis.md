# Building-Committee Requests — Workflow Analysis & Recommendations

Status: for committee discussion · 2026-07-05

## Scope and evidence base (read this first)

The original ask was to analyze the **#building-committee Slack archive** — the request types we receive and how we talk and work through them — and propose a better workflow for building-use and maintenance requests. The archive itself (synced into the `slack_archive_messages` table in production Supabase) was **not reachable from the session that produced this doc**: the sandbox's network policy blocks `*.supabase.co`, and the policy couldn't be changed. So this analysis rests on the next-best evidence, all verified against the repo:

1. **The 11 real requests** cataloged in [`tasks-projects-intake-plan.md`](tasks-projects-intake-plan.md) (the sample the current intake was designed from).
2. **The system as actually built** — every claim below about current behavior was checked against the code, with `file:line` citations.
3. **The UX walkthrough and security review** in [`app-review-findings.md`](app-review-findings.md).
4. **Git history** on `main` (what got iterated on hardest).

**To redo the archive pass later** (recommended — it would put real counts and quotes behind section 2): run a Claude session in an environment whose network policy allows the Supabase domain, or export the channel locally (`slack_archive_messages` for the building-committee `channel_id`, grouped by `thread_ts`) and hand the JSON to a session. The analysis framework in this doc (taxonomy, decision factors, stall points) is written so archive data can be dropped in without restructuring.

---

## 1. What we receive

From the 11-request sample plus the shape of the four wizard tracks (`app/portal/requests/_shared/tracks.tsx`):

| Type | Share of sample | Character | Examples |
|---|---|---|---|
| **Use a space** | 3/11 | Member, single space, low stakes | Kitchen baking day, gym play dates, offices as nap rooms |
| **Host an event** | 3/11 | Multi-space, setup/cleanup, often guests | Birthday party (kitchen+dining+gym), wedding reception, guest speaker |
| **Class / program** | 2/11 | Recurring, sometimes outside/paid instructor | Sewing class, member-led youth activities |
| **Repair** | 1/11 | Execution-centric, no approval question | Pulpit mic too quiet |
| **Purchase / equipment** | 1/11 | Small spend decision | Two grey chairs for the nursery |
| **Question** | 1/11 | Just needs an answer | "Why are recordings password-protected?" |

Two patterns cut across every type:

- **Member vs. outside group** is the biggest fork — outside/paid activity pulls in fee, insurance, and waiver questions.
- **The committee weighs the same ~8 factors every time**: schedule conflict · member-or-outside · fee/donation · insurance/liability · supervision (esp. kids) · cleanup/damage · who opens & locks up · mission fit. These are already rendered as the "Things to weigh" checklist in the review queue.

And one structural fact: the sample split **roughly 50/50 between one-step tasks and multi-step projects** — so "promote to project" isn't an edge case, it's half the volume.

## 2. How we work through them today (as built)

### Intake — three doors into one table

All requests land in `maintenance_requests`, but through **three different code paths**:

1. **The portal wizard** (`createRequest`, `lib/maintenance/actions.ts:661`) — four tracks (building-use / gym / maintenance / question), structured answers in a `details` jsonb column. Mobile-polished (most of the wizard's git history is tap-to-advance/ergonomics work). Repairs **skip review** and go straight to the work queue as `approved`; everything else lands `pending_review` (`actions.ts:729-730`).
2. **The old ticket form** at `/portal/tasks/new` (`createTicket`, `actions.ts:20`) — category/area/priority, **no `details`**. This is also where the public "maintenance" link redirects (behind login).
3. **The public building form** at `/assistance/building` (`createPublicBuildingRequest`, `actions.ts:897`) — unauthenticated, service-role insert, no availability check.

The booking calendar in the wizard shows **live availability from confirmed events only** — pending requests deliberately don't block (`lib/requests/availability-actions.ts:8-10`), so two members can pick the same slot and both see it as free; only the committee sees the collision.

### Discussion — the committee lives in Slack, the state lives in the portal

On submit, the committee hears about it twice: an email to super-admins + the responsible area team (`lib/notifications/new-ticket.ts:44-84`) and **one Slack post** to the notify channel, which stores its `slack_message_ts` so that **thread replies flow back into the ticket as comments** (`app/api/slack/events/route.ts:138-181`). That inbound sync existing at all is the clearest signal of how the committee actually works: *the discussion happens in the Slack thread.*

But the loop is only half-open:

- Portal comments **never post out** to the Slack thread.
- Votes and decisions **never post** to the thread either — someone reading only Slack can't tell a request was approved.
- The requester hears **nothing on submit** (no receipt), only on decision (`decideRequest` → `notifyDecision`, `actions.ts:1183-1190`).

### Decision — advisory votes, one-member approval

The voting system was built (migration 0050: auto-decide on majority) and then **deliberately retired** (migration 0074): votes are now a non-binding tally with a "Waiting on: …" list, and **any one committee member** approves or declines via `decide_request` (`0074:90`), note required on decline. This matches the manual-approval culture — but the codebase still carries the old rule in comments and dead code (`lib/votes/threshold.ts` is unused; `actions.ts:1006-1009` and `0050:6-12` describe behavior that no longer exists).

### After approval — the booking is instant, follow-through is manual

- Approval **auto-books calendar events**, one per occurrence for recurring requests (`createEventFromApprovedRequest`, `actions.ts:1069-1116`). The event is live immediately — no confirmation step.
- **No conflict re-check happens at approval.** Conflict flags (⚠ chips in the queue) are computed only while `pending_review` — so two overlapping pending requests can both be approved and both create events.
- If the request has no resolvable date, the auto-booker **silently skips** (`actions.ts:1079-1082`) — the committee is expected to notice and book manually, with no flag that it was skipped.
- **Keys / setup / cleanup tasks are never created automatically.** The sub-task placeholder literally suggests "Confirm booking & details / Set up tables & chairs / Open & lock the building" (`Actions.tsx:775`) — the intent is documented, but a human must type them every time.
- Repairs: auto-approved (good — no committee ceremony for a broken mic), but assignment is a manual chip and **the reporter is never told when it's fixed**.

### Notification matrix (as built)

| Event | Requester | Committee email | Slack thread |
|---|---|---|---|
| Submitted | ❌ nothing | ✅ super-admins + area team | ✅ new root post |
| Vote cast | ❌ | ❌ | ❌ |
| Comment (portal) | ❌ | ❌ | ❌ |
| Comment (from Slack) | *(lands as ticket comment)* | ❌ | (inbound only) |
| Decision | ✅ email w/ note | ❌ | ❌ |
| Booked on calendar | ❌ | ❌ | ❌ |
| Repair done | ❌ | ❌ | ❌ |

The in-app bell is decorative — there is no in-app notification store at all.

## 3. Gap analysis

**G1 — The Slack loop is half-open.** The committee's real conversation surface gets the opening post and nothing else. Decisions, votes, and portal comments are invisible in Slack; Slack-only members work from stale state. (This is the single biggest mismatch between how the committee *talks* and where the workflow *lives*.)

**G2 — The requester's experience has silent gaps.** No receipt on submit, no "your event is on the calendar," no "your repair is fixed," and pending requests aren't counted in the member's own KPIs (finding U6). The decision email exists and is good — it's the only touchpoint.

**G3 — Intake drift breaks conflict detection silently.** The public building form uses different space names than the portal (`"Gymnasium"` / `"Main Meeting Room"` snake_case keys via `PUBLIC_SPACE_LABELS`, `actions.ts:889` vs. the portal's `"Gym"`, `"Room 201"` list in `tracks.tsx:17`). Conflict matching is exact-string, so **a public request for the "Gymnasium" will never flag against a portal request for the "Gym."** It also emits `details.kind` values (`event`, `use-a-space`) the portal never produces, has no availability calendar, and no rate limit (S10, WAF rule staged but unpublished).

**G4 — Double-booking is possible end-to-end.** Intake ignores pending requests (by design), conflict flags are advisory and pre-decision only, and approval re-checks nothing before creating live events.

**G5 — Follow-through is where projects die.** Half the sample volume needs multi-step follow-through (keys, setup, cleanup), and today every one of those tasks is hand-typed after approval — or skipped.

**G6 — Two lifecycles are squeezed through one pipeline.** Building-use is **approval-centric** (decide → book → prepare → reset), maintenance is **execution-centric** (triage → assign → fix → close). The code already half-acknowledges this (repairs skip review), but post-approval the system treats both as generic tasks.

**G7 — Dead voting code misleads.** `majorityThreshold()` and the 0050-era comments describe an auto-decide rule that was retired; a future contributor could easily re-enable the wrong behavior.

## 4. Proposed workflow

The shape: **portal as the system of record, Slack as the working surface, and the requester informed at every state change.** Stage by stage:

**Intake** — one pipeline. Rebuild the public building form as a thin, unauthenticated instance of the same wizard vocabulary (same `SPACES`, same `details.kind` values), or funnel it into the portal the way maintenance already is. Show pending requests as soft "someone else has asked about this time" warnings in the booking calendar. Send the requester a receipt immediately ("Got it — the building committee will review and follow up").

**Triage & discussion** — meet the committee in Slack. Keep the new-request root post, and complete the loop: portal comments post to the thread; votes post as threaded updates ("👍 3 · waiting on Dave, Corey"); the decision posts as the thread's closing message with the note. The existing `slack_message_ts` plumbing and inbound sync already carry half of this.

**Decision** — keep one-member manual approval with advisory votes (it matches how the committee actually operates), but make approval **conflict-aware**: re-run the conflict check inside the approve action and require an explicit "book anyway" acknowledgment when a flag is live. Keep the "Things to weigh" checklist — it's the 8 factors, verified against the sample.

**Scheduling** — approval keeps auto-booking, plus two fixes: when no event could be created, surface a visible "needs manual booking" flag on the approved request instead of silently skipping; and notify the requester with the booked date/time ("You're on the calendar for July 18, 6–9pm, Gym + Kitchen").

**Follow-through** — seed it from answers the wizard already collected. On approval, offer pre-checked sub-tasks derived from the request's own `details`: no key (`hasKey` false) → "Arrange open & lock"; tables/chairs in `needs` → "Set up tables & chairs"; `selfCleanup` false → "Schedule cleanup"; kitchen in `spaces` → "Kitchen access & reset." One click accepts the seeded checklist — this is the "promote to project" click, informed by data instead of a blank textarea. Events already feed the shutdown-task cron; approval-seeded tasks complete the picture.

**Close the loop** — decision email (exists) + booked confirmation (new) + "repair complete" note to the reporter when a maintenance task hits `done` (new). Count pending-review requests in the member's KPIs.

## 5. Prioritized recommendations

### Quick wins (small diffs, high leverage)

1. **Unify the public building form's vocabulary** with the portal wizard (space names + `details.kind`) — fixes the silently-broken cross-source conflict matching (G3). Cheapest correctness fix in this doc.
2. **Post decisions and vote tallies back to the request's Slack thread** — the thread plumbing already exists (G1).
3. **Mirror portal comments out to Slack** — completes the two-way sync (G1).
4. **Conflict re-check + acknowledgment inside `decideRequest`**, and a "needs manual booking" flag when the auto-booker skips (G4).
5. **Submission receipt email to the requester**, and count pending requests in member KPIs (G2, U6).
6. **Delete `lib/votes/threshold.ts` and fix the stale 0050-era comments** (G7).

### Medium (a focused build each)

7. **Approval-seeded follow-through sub-tasks** derived from the request's `details` (G5) — the biggest workflow upgrade for events.
8. **Pending-request soft warnings in the intake calendar** (G4).
9. **Maintenance closure loop**: notify the reporter on `done`; consider auto-assign from the area's responsible team (G6).
10. **Booked-confirmation email** with event details after auto-booking (G2).

### Later

11. **In-app notification store** (make the bell real) — submit/decision/comment events, with the email/Slack senders writing to it too.
12. **Structured supervision question** for events with kids (today: free-text `children` count) — it's one of the 8 factors but isn't captured as data.
13. **Publish the staged WAF rate-limit** on `/assistance/*` (S10) if the public form stays.
14. **Re-run this analysis against the actual Slack archive** (see scope note) — validate the taxonomy shares, measure time-to-decision and stall points, and mine real threads for missing-info patterns the wizard should absorb.
