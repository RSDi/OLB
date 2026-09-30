// Who can use the HS Schedule (/portal/schedule): the board and the coaches
// (anyone in a leadership volunteer role on a team: Head coach, Assistant
// coach…). The database allows exactly them (can_plan_hs_schedule(),
// migration 0108). Safe to import from client components.

export function canUseHsSchedule(viewer: { isStaff: boolean } | null | undefined, isCoach: boolean): boolean {
  return !!viewer && (viewer.isStaff || isCoach);
}
