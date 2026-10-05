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
  // Settings grants (migration 0057). Absent/false = no grant. Super-admins
  // implicitly hold all three regardless of these.
  can_edit_settings?: boolean;
  can_delete_settings?: boolean;
  can_undelete_settings?: boolean;
  // Payments grant (migration 0101): the Treasurer and whoever else a
  // super-admin enables. Any approved member can hold it, board or not.
  can_manage_finances?: boolean;
  // Registrations grant (migration 0102): reviewing registrations, placing
  // players on teams, editing and removing players. Any approved member.
  can_manage_registrations?: boolean;
  // Travel grant (migration 0110): the travel coordinator keeps the hotels
  // and places to eat in External Contacts. Any approved member.
  can_manage_travel?: boolean;
  // Slack DMs grant (migration 0118): messaging families from the Directory
  // as yourself in Slack. Any approved member.
  can_slack_dm?: boolean;
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

// --- Settings grants ---------------------------------------------------------
// Board members (role = admin) can VIEW Settings, but editing,
// deleting, and restoring each require a standing grant a super-admin gives
// them. Super-admins implicitly hold every grant.

export function canEditSettings(m: MemberLike | null | undefined): boolean {
  if (isSuperAdmin(m)) return true;
  return isStaff(m) && !!m?.can_edit_settings;
}
export function canDeleteSettings(m: MemberLike | null | undefined): boolean {
  if (isSuperAdmin(m)) return true;
  return isStaff(m) && !!m?.can_delete_settings;
}
export function canUndeleteSettings(m: MemberLike | null | undefined): boolean {
  if (isSuperAdmin(m)) return true;
  return isStaff(m) && !!m?.can_undelete_settings;
}

// --- Payments ----------------------------------------------------------------
// Seeing every family's balance and recording charges and payments. Mirrors
// public.can_manage_finances() (0101).

export function canManageFinances(m: MemberLike | null | undefined): boolean {
  if (!m || m.status !== "approved") return false;
  return m.role === "super_admin" || !!m.can_manage_finances;
}

// --- Registrations -----------------------------------------------------------
// Reviewing registrations from the public form, putting players on teams,
// editing a player and taking one off the roster. Mirrors
// public.can_manage_registrations() (0102).

export function canManageRegistrations(m: MemberLike | null | undefined): boolean {
  if (!m || m.status !== "approved") return false;
  return m.role === "super_admin" || !!m.can_manage_registrations;
}

// --- Travel --------------------------------------------------------------------
// The travel coordinator: reading, adding and editing the External Contacts
// of the travel types (Hotels, Food). Mirrors public.can_manage_travel() (0110).

export function canManageTravel(m: MemberLike | null | undefined): boolean {
  if (!m || m.status !== "approved") return false;
  return m.role === "super_admin" || !!m.can_manage_travel;
}

// --- Slack DMs -----------------------------------------------------------------
// Messaging the families of the Directory players you can see, one Slack DM
// per person, sent as you. Mirrors public.can_slack_dm() (0118).

export function canSlackDm(m: MemberLike | null | undefined): boolean {
  if (!m || m.status !== "approved") return false;
  return m.role === "super_admin" || !!m.can_slack_dm;
}

// Add/rename settings items needs the edit grant; (was: any staff).
export const canManageAreas = canEditSettings;
export const canManagePriorities = canEditSettings;
export const canDeleteAreas = canDeleteSettings;
export const canDeletePriorities = canDeleteSettings;

// --- Member administration ---------------------------------------------------

// Approving/denying/promoting members + issuing grants is super-admin only.
export const canManageMembers = isSuperAdmin;
export const canPromoteToAdmin = isSuperAdmin;

// --- Soft delete -------------------------------------------------------------
// Soft-delete needs the delete grant; restore needs the undelete grant;
// permanent purge stays super-only. The Deleted tab itself is super-admin-only
// until an RLS follow-up lets board members see soft-deleted rows.

export const canSeeDeleted = isSuperAdmin;
export const canSoftDelete = canDeleteSettings;
export const canHardDelete = isSuperAdmin;
export const canRestore = canUndeleteSettings;

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
