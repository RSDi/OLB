// Who can use Planning (the calendar's tasks, Review, Template, the monthly
// board meetings and Settings → Planning Roles). The board, but while it's in
// staged rollout only the accounts in lib/auth/feature-preview.ts. To open it
// up (to Rachel and the board), drop the seesFullUi check here and in
// ./guard.ts, the sidebar's previewOnly flag on Planning, the Settings tab's
// preview gate, and "/portal/events" in tests/unit/help-guide.test.ts's
// PREVIEW_ROUTES; then take `preview` off its guide sections. Safe to import
// from client components.

export function canUsePlanning(
  viewer: { isStaff: boolean; seesFullUi: boolean } | null | undefined,
): boolean {
  return !!viewer && viewer.isStaff && viewer.seesFullUi;
}
