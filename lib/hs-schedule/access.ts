// Who can use the HS Schedule (/portal/schedule): the board and the coaches
// (anyone in a leadership volunteer role on a team: Head coach, Assistant
// coach…). The database already allows exactly them (can_plan_hs_schedule(),
// migration 0108). While it's in staged rollout the page, its sidebar item
// and its guide section only show to the accounts in
// lib/auth/feature-preview.ts. To open it up, drop the seesFullUi check here
// and in ./guard.ts, take "/portal/schedule" off PREVIEW_ROUTES in
// tests/unit/help-guide.test.ts, and take `preview` off its guide sections.
// Safe to import from client components.

export function canUseHsSchedule(
  viewer: { isStaff: boolean; seesFullUi: boolean } | null | undefined,
  isCoach: boolean
): boolean {
  return !!viewer && viewer.seesFullUi && (viewer.isStaff || isCoach);
}
