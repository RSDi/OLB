# Tasks & Projects — friendly intake + committee review

Branch: `tasks-projects-intake` · Status: planning → building Phase 1

## Goal

Replace ad-hoc email requests to the building committee (Dave's inbox) with a
warm, big-button intake on the member portal, and give the committee a place to
review, discuss, and approve/decline-with-reason. Built on the existing
Tasks & Projects foundation (`maintenance_requests` + `projects`).

## Philosophy: Task vs Project

- **Task** = one thing to do. One row, one owner, done/not-done.
- **Project** = a named bundle holding **2+ coordinated tasks**, with its own page.
- The member **never** chooses task-vs-project. They just make a request.
  The committee decides at approval — most become a single task; the heavy ones
  get **promoted to a project** with child tasks. One click, nothing lost.

## Decisions (locked)

1. **Committee = existing staff** (`is_staff()` = approved admin/super_admin).
   No new role or RLS — staff already see all tasks and members see their own.
2. **Reuse the task table** (`maintenance_requests`) with a review stage
   (new `review_status` + `details jsonb`). The request *is* the task; on
   approval it's already there, and we promote to a project if it needs it.
3. **Build the full Building Use loop first**, end to end: wizard → review
   queue → approve/decline → promote-to-project. Other tracks follow.

## What the 11 real requests told us

Five intake tracks; an even task/project split (validates that promotion must be easy):

| Request | Track | Task/Project |
|---|---|---|
| Member uses kitchen to bake (Wed 10/22) | Use a space | Task |
| Gym for Mom play dates (5 dates) | Use a space | Task |
| Side offices as baby nap rooms (during conf.) | Use a space | Task |
| Nelson birthday party (kitchen+dining+gym) | Host an event | Project |
| Wedding reception in the gym (multi-day setup) | Host an event | Project |
| Midwife guest speaker (outside, 20–50, April) | Host an event | Project |
| Sewing class (outside paid instructor, trial) | Class / program | Project |
| Youth activities (recurring, member-led) | Class / program | Project |
| Pulpit mic too quiet | Report / equipment | Project |
| Two grey chairs for the nursery | Report / equipment | Task |
| "Why are recordings password-protected?" | Ask the committee | Task |

Two cross-cutting patterns:
- **Member vs. outside group** — outside/paid (midwife, sewing, wedding) needs
  fee + insurance + waiver questions. The wizard branches on this.
- **The committee weighs the same ~8 factors every time** → a decision checklist:
  schedule conflict · member-or-outside · fee/donation · insurance/liability ·
  supervision (esp. kids) · cleanup/damage · who opens & locks up · mission fit.

## Intake UX (member side)

**Big-button launcher** — clone the tile grid at `app/portal/directory/page.tsx`:
- 🏠 Use a space · 🎉 Host an event · 📚 Run a class or program ·
  🔧 Report a problem / request equipment · 💬 Ask the committee

**Walkthrough** — one question per screen, progress bar (`.rsd-prog` + slide
animations already in `globals.css`). Shared spine, from the real `wizardFields`:

1. *(auto)* "You're signed in as <name> — for you/OLB, or an outside group?"
   → outside unlocks fee/insurance/host-contact later
2. The track's "what" (occasion / activity / what's broken / your question)
3. **Where** — tap the space(s): Gym, Kitchen, Dining, Room 201, offices, Nursery, Outdoors (multi-select for events)
4. **When** — date(s) + time; one-time / a few dates / weekly / monthly; setup+cleanup window for events
5. **How many** people (+ kids → flags supervision)
6. **What you'll need** — tables/chairs (how many), kitchen, microphone, projector, childcare, outlets
7. **Getting in & cleanup** — who opens/locks, key/code?, can you reset the space
8. *(outside/paid only)* insurance/waiver + fee acknowledgement
9. Anything else + attachments → Review & submit → friendly confirmation
   (reuse the `CheckCircle` success panel in `tasks/new/Form.tsx`)

Report-a-problem and Ask-the-committee are short (3–4 steps). Final submit reuses
`createTicket` (extended to write `details` + `review_status='pending_review'`);
requester identity is stamped server-side, no form field.

## Committee review UX

- **Review queue** (new nav item, staff-gated, red pending-count badge like Settings).
  Clone `app/portal/tasks/page.tsx`: tabs **Needs review / Approved / Declined**,
  cards showing requester, track, space, date, flag chips (outside · kids · kitchen · recurring).
- **Request detail**: the structured request rendered cleanly + the **decision
  checklist** (8 factors) + a **discussion thread** (reuse `ticket_comments` +
  the threaded `CommentThread`).
- **Approve** → becomes an active task; prompt "one thing, or several steps?"
  → keep as task, or **Promote to project** (seeds child tasks, e.g. Nelson party →
  Confirm booking · Set up tables & chairs · Kitchen access · Open/lock building · Cleanup).
- **Decline** → reason required → emailed to requester.

## Data model (migration 0046)

Additive only — committee=staff means existing RLS already covers visibility.
Add to `maintenance_requests`:
- `review_status text not null default 'approved'` check `(pending_review|approved|declined)`
  — existing rows backfill to `approved`; the wizard inserts `pending_review`.
- `decline_reason text`, `reviewed_by uuid → auth.users`, `reviewed_at timestamptz`
- `details jsonb` — the wizard answers (spaces, dates, headcount, needs, access, fees…)
- partial index on `review_status` where `deleted_at is null`

App-layer (not migration): the work queue at `/portal/tasks` filters to
`review_status='approved'`; the Review queue shows `pending_review`.

## Reuse map

- Task table `maintenance_requests`; `projects` + `project_id` (`0045`); `task_categories`,
  `priorities`, `areas`; threaded `ticket_comments` + `CommentThread`.
- `createProjectFromRecording` in `lib/projects/actions.ts` → adapt into `promoteTaskToProject`.
- Resend notifier `lib/notifications/new-ticket.ts` (+ `access-request.ts` as the
  "review & approve/deny" precedent) → decision email to requester.
- Big-button grid `app/portal/directory/page.tsx`; `Pill`/`Select`/`Input` in `app/components/ui.tsx`.
- `MembersTab.tsx` approve/deny UX as the queue/decision template.

## Build sequence — Building Use loop (Phase 1)

1. **Migration 0046** — review-stage columns (apply by hand in Supabase SQL editor).
2. **Read** `node_modules/next/dist/docs/` before any Next code (AGENTS.md — this Next has breaking changes).
3. **Launcher** `/portal/requests` — big-button tiles.
4. **Building Use wizard** `/portal/requests/new?track=building-use` — stepped flow → `details`.
5. **Extend `createTicket`** to persist `details` + set `review_status='pending_review'`.
6. **Review queue** (staff) — filter `pending_review`, decision checklist, flag chips.
7. **Approve / decline-with-reason** actions — stamp `reviewed_by/at`, `decline_reason`.
8. **Promote-to-project** action (adapt `createProjectFromRecording`) + approval UI.
9. **Decision notification** to requester (clone the notifier).
10. **Filter work queue** `/portal/tasks` to `review_status='approved'`.
11. **Verify** the full loop in preview.

## Later phases

- **B** — remaining tracks (event, class/program, maintenance, question), recurrence
  picker, outside-group fee/insurance branch.
- **C** — decision audit trail (clone `member_audit_log` trigger, `0025`), in-app
  notifications (the topbar bell is currently decorative), reconcile/unify with the
  public `building_requests` flow (`app/(site)/assistance/building`).

## Hardening / open items

- **Insert guard**: RLS insert only checks `submitted_by`; a crafted insert could set
  `review_status='approved'`. Acceptable for v1 (small known congregation, committee=admins);
  add a BEFORE INSERT trigger forcing non-staff inserts to `pending_review` if needed.
- **Reconcile `building_requests`** (public site) — decide whether the portal wizard
  replaces/unifies it so there's one pipeline (deferred to Phase C).
- Pick one action return shape for new code (`{success?, error?, id?}`) — the repo has drift.
