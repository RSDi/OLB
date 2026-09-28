// Who a super-admin can "Preview as". Pure, so the Activity page (to show the
// button) and the server action (to enforce it) agree, and tests can pin it.

export interface PreviewTarget {
  user_id: string | null;
  role: string;
  status: string;
  access_revoked_at: string | null;
  deleted_at?: string | null;
}

// Why this member can't be previewed, or null when they can.
export function previewBlocker(target: PreviewTarget, viewerUserId: string): string | null {
  if (target.deleted_at) return "That member has been removed.";
  if (!target.user_id) return "They haven't signed up for the portal yet.";
  if (target.user_id === viewerUserId) return "That's you.";
  if (target.role === "super_admin") return "Super-admins can't be previewed.";
  if (target.status !== "approved") return "Only approved members can be previewed.";
  if (target.access_revoked_at) return "Their login has been revoked.";
  return null;
}
