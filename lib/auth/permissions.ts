// Central capability checks for the maintenance system.
//
// Every UI gate, server action, and RLS-mirroring guard imports from here so
// the rules live in one place. The DB enforces the same matrix via SECURITY
// DEFINER helpers in migration 0001 (`is_staff`, `is_super_admin`) — these
// TS helpers exist to drive the UI and short-circuit before hitting the DB.

export type MemberRole = "member" | "admin" | "super_admin";
export type MemberStatus = "pending" | "approved" | "denied";

export interface MemberLike {
  role: MemberRole;
  status: MemberStatus;
}

interface TicketLike {
  submitted_by: string | null;
}

// --- Role predicates ---------------------------------------------------------

export function isStaff(m: MemberLike | null | undefined): boolean {
  if (!m || m.status !== "approved") return false;
  return m.role === "admin" || m.role === "super_admin";
}

export function isSuperAdmin(m: MemberLike | null | undefined): boolean {
  if (!m || m.status !== "approved") return false;
  return m.role === "super_admin";
}

// --- Settings (areas + priorities) -------------------------------------------

// Staff can add and rename areas/priorities. Soft-delete is super-admin only.
export const canManageAreas = isStaff;
export const canManagePriorities = isStaff;
export const canDeleteAreas = isSuperAdmin;
export const canDeletePriorities = isSuperAdmin;

// --- Member administration ---------------------------------------------------

// Approving/denying/promoting members is super-admin only — admins manage
// facility work, not the membership list.
export const canManageMembers = isSuperAdmin;
export const canPromoteToAdmin = isSuperAdmin;

// --- Soft delete -------------------------------------------------------------

export const canSeeDeleted = isSuperAdmin;
export const canSoftDelete = isSuperAdmin;
export const canHardDelete = isSuperAdmin;
export const canRestore = isSuperAdmin;

// --- Tickets -----------------------------------------------------------------

export const canChangeTicketStatus = isStaff;
export const canAssignTicket = isStaff;

// Anyone signed in can read a ticket they submitted; staff sees all.
export function canReadTicket(
  m: MemberLike | null | undefined,
  ticket: TicketLike,
  userId: string | null
): boolean {
  if (isStaff(m)) return true;
  return Boolean(userId) && ticket.submitted_by === userId;
}

// Submitter and staff can comment.
export function canCommentOnTicket(
  m: MemberLike | null | undefined,
  ticket: TicketLike,
  userId: string | null
): boolean {
  return canReadTicket(m, ticket, userId);
}
