// Who can use the HS Schedule (/portal/schedule): the board and the coaches
// (anyone in a leadership volunteer role on a team: Head coach, Assistant
// coach…) plan it; the database lets exactly them change it
// (can_plan_hs_schedule(), migration 0108). The travel coordinator (the
// Travel permission) sees it without changing it (0111). Safe to import from
// client components.

export function canUseHsSchedule(viewer: { isStaff: boolean } | null | undefined, isCoach: boolean): boolean {
  return !!viewer && (viewer.isStaff || isCoach);
}

// "edit" for the planners, "view" for the travel coordinator, else null.
export function hsScheduleAccess(
  viewer: { isStaff: boolean; canManageTravel?: boolean } | null | undefined,
  isCoach: boolean
): "edit" | "view" | null {
  if (canUseHsSchedule(viewer, isCoach)) return "edit";
  return viewer?.canManageTravel ? "view" : null;
}
