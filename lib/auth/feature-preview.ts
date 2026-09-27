// Staged rollout: features still being cleaned up stay visible only to the
// accounts listed here. Everyone else gets the trimmed-down UI. This hides
// navigation only; the routes, data and permissions behind it are unchanged.
// Safe to import from client components.

const FULL_UI_EMAILS = ["jeff@malone.net"];

export function seesFullUi(email: string | null | undefined): boolean {
  if (!email) return false;
  return FULL_UI_EMAILS.includes(email.trim().toLowerCase());
}
