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
  // Website grant (migration 0120): editing the public club website's menu,
  // page text and pictures. A board member's grant, like the Settings ones.
  can_manage_website?: boolean;
  // Every permission the person holds (0122): their access profile's plus
  // their extras. Absent before 0122. Super-admins hold all of them anyway.
  permissions?: string[];
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
// Every approved member can open Settings (Release Notes). Editing,
// deleting, and restoring each require a standing grant a super-admin gives
// a board member. Super-admins implicitly hold every grant.

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

// Notes on players (0124): the board, or the Registrations permission.
// Mirrors public.can_player_notes().
export function canPlayerNotes(m: MemberLike | null | undefined): boolean {
  return isStaff(m) || canManageRegistrations(m);
}

// --- Uniforms ------------------------------------------------------------------
// The registration workflow's uniforms (0130): items, prices and sizes, and
// the uniform order. The uniforms permission, or Registrations. Mirrors
// public.can_manage_uniforms().

export function canManageUniforms(m: MemberLike | null | undefined): boolean {
  return hasPermission(m, "uniforms") || canManageRegistrations(m);
}

// --- Club finances (0131) -------------------------------------------------------
// The Snapshot (money in and out, budget vs paid, no family details): the
// board, whoever is given "See club finances", and Payments. Mirrors
// public.can_view_finances().

export function canViewFinances(m: MemberLike | null | undefined): boolean {
  return isStaff(m) || hasPermission(m, "finances_view") || canManageFinances(m);
}

// --- Travel --------------------------------------------------------------------
// The travel coordinator: hotels/food in External Contacts (0110), hotel
// registration check-off and family email/Slack follow-ups (0134). Mirrors
// public.can_manage_travel().

export function canManageTravel(m: MemberLike | null | undefined): boolean {
  if (!m || m.status !== "approved") return false;
  return m.role === "super_admin" || !!m.can_manage_travel;
}

// Emailing families from the Directory: the board, Registrations, or Travel
// (0134 hotel follow-ups).

export function canEmailFamilies(m: MemberLike | null | undefined): boolean {
  return isStaff(m) || canManageRegistrations(m) || canManageTravel(m);
}

// --- Slack DMs -----------------------------------------------------------------
// Messaging the families of the Directory players you can see, one Slack DM
// per person, sent as you. The Slack DMs grant (0118) or Travel (0134).
// Mirrors public.can_slack_dm().

export function canSlackDm(m: MemberLike | null | undefined): boolean {
  if (!m || m.status !== "approved") return false;
  return m.role === "super_admin" || !!m.can_slack_dm || canManageTravel(m);
}

// --- Website -------------------------------------------------------------------
// Settings → Website: the public site's menu, page text and pictures. A board
// member with the grant, or a super-admin. Mirrors public.can_manage_website()
// (0120).

export function canManageWebsite(m: MemberLike | null | undefined): boolean {
  if (isSuperAdmin(m)) return true;
  return isStaff(m) && !!m?.can_manage_website;
}

// --- Permissions given through access profiles (0122, 0123) -----------------

// Holds this permission: a super-admin, or someone whose profile or extras
// include it. Mirrors public.has_permission().
export function hasPermission(m: MemberLike | null | undefined, key: string): boolean {
  if (!m || m.status !== "approved") return false;
  return m.role === "super_admin" || !!m.permissions?.includes(key);
}

// Board powers anyone can be given (0123). Board has them all; these mirror
// the public.can_*() helpers in that migration.
export const canSeeAllPlayers = (m: MemberLike | null | undefined) =>
  isStaff(m) || hasPermission(m, "see_all_players");
export const canMemberNotes = (m: MemberLike | null | undefined) => isStaff(m) || hasPermission(m, "member_notes");
// Board, Check off requirements, or Travel (0134 hotel registration).
export const canCheckRequirements = (m: MemberLike | null | undefined) =>
  isStaff(m) || hasPermission(m, "player_requirements") || canManageTravel(m);
export const canApproveMembers = (m: MemberLike | null | undefined) =>
  isStaff(m) || hasPermission(m, "approve_members");
export const canEditContacts = (m: MemberLike | null | undefined) => isStaff(m) || hasPermission(m, "contacts_edit");
// Coaches plan it too; they're checked separately (viewerIsCoach).
export const canPlanHsSchedule = (m: MemberLike | null | undefined) => isStaff(m) || hasPermission(m, "hs_schedule");

// Super-admin powers anyone can be given (0123).
export const canManageTeams = (m: MemberLike | null | undefined) => hasPermission(m, "teams");
export const canManageSiteLinks = (m: MemberLike | null | undefined) => hasPermission(m, "site_links");

// Every approved member opens Settings (Release Notes, plus any tabs their
// permissions add). Pending and denied accounts stay out.
export const canOpenSettings = (m: MemberLike | null | undefined) =>
  !!m && m.status === "approved";

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
