// Who can use Planning (the calendar's tasks, Review, Template, the monthly
// board meetings and Settings → Planning Roles). The board (staff). Safe to
// import from client components.

export function canUsePlanning(
  viewer: { isStaff: boolean } | null | undefined,
): boolean {
  return !!viewer?.isStaff;
}
