// Permissions and access profiles (migration 0122).
//
// A permission is a key like "payments". A super-admin bundles permissions
// into access profiles (Settings → Access Profiles) and puts each person on
// one; a person can also hold extras on top. Someone with no profile set is on
// the built-in profile for their role (Member or Board). Super-admins hold
// every permission and have no profile. public.my_permissions() and
// public.has_permission() compute the same thing in the database.
//
// Adding a permission: add it to PERMISSIONS, give it a check in
// permissions.ts (and a has_permission() helper for any RLS it needs), and
// say what it does in lib/help/guide.ts.

import type { MemberLike, MemberRole } from "./permissions";

export type PermissionKey =
  | "payments"
  | "registrations"
  | "travel"
  | "slack_dm"
  | "settings_edit"
  | "settings_delete"
  | "settings_undelete"
  | "website"
  // Board powers anyone can be given (0123); Board has them all already.
  | "see_all_players"
  | "member_notes"
  | "player_requirements"
  | "approve_members"
  | "contacts_edit"
  | "hs_schedule"
  // Super-admin powers anyone can be given (0123).
  | "teams"
  | "site_links";

// The member columns each permission lived in before 0122. Still used to read
// grants on a database without 0122, and nothing else.
export type LegacyGrantColumn =
  | "can_manage_finances"
  | "can_manage_registrations"
  | "can_manage_travel"
  | "can_slack_dm"
  | "can_edit_settings"
  | "can_delete_settings"
  | "can_undelete_settings"
  | "can_manage_website";

export interface PermissionDef {
  key: PermissionKey;
  label: string;
  desc: string;
  // "manage" and "setup": any member can hold it. "board": a Board power,
  // for someone who isn't Board (Board has it anyway). "settings": Board
  // only; it does nothing for someone who isn't Board.
  group: "manage" | "board" | "setup" | "settings";
  // The column it lived in before 0122. The permissions added later have
  // none, and before 0122 nobody holds them.
  legacyColumn?: LegacyGrantColumn;
}

export const PERMISSIONS: PermissionDef[] = [
  { key: "payments", label: "Payments", desc: "See every family's balance and record payments", group: "manage", legacyColumn: "can_manage_finances" },
  { key: "registrations", label: "Registrations", desc: "Review registrations, put players on teams and edit players", group: "manage", legacyColumn: "can_manage_registrations" },
  { key: "travel", label: "Travel", desc: "Add and edit the hotels and places to eat in External Contacts", group: "manage", legacyColumn: "can_manage_travel" },
  { key: "slack_dm", label: "Slack DMs", desc: "Send families Slack DMs from the Directory, as themselves", group: "manage", legacyColumn: "can_slack_dm" },
  { key: "settings_edit", label: "Edit", desc: "Add and change Settings items, like Requirements", group: "settings", legacyColumn: "can_edit_settings" },
  { key: "settings_delete", label: "Delete", desc: "Delete Settings items", group: "settings", legacyColumn: "can_delete_settings" },
  { key: "settings_undelete", label: "Undelete", desc: "Restore deleted Settings items", group: "settings", legacyColumn: "can_undelete_settings" },
  { key: "website", label: "Website", desc: "Change the club website's menu, page text and pictures", group: "settings", legacyColumn: "can_manage_website" },
  { key: "see_all_players", label: "See all players", desc: "Every player, listed or not, with fees, waivers, shirts, and parents' sign-up status and \"Can help\"", group: "board" },
  { key: "member_notes", label: "Member notes", desc: "Read and write the private Member notes on profiles", group: "board" },
  { key: "player_requirements", label: "Check off requirements", desc: "Mark players done or waived on requirements, like the handbook signature, for the players they can see", group: "board" },
  { key: "approve_members", label: "Approve access requests", desc: "Approve or deny people asking to join, in Settings → Members", group: "board" },
  { key: "contacts_edit", label: "External Contacts", desc: "See, add and edit every External Contact, and their history", group: "board" },
  { key: "hs_schedule", label: "Plan HS Schedule", desc: "Change the HS Schedule, like coaches do", group: "board" },
  { key: "teams", label: "Teams & volunteers", desc: "Set up teams and volunteer roles, and fill team spots. Putting someone in a leadership spot makes them a coach", group: "setup" },
  { key: "site_links", label: "Sidebar Links & Public Directory", desc: "Change the links in everyone's sidebar and the public Directory link", group: "setup" },
];

export const PERMISSION_GROUPS: { key: PermissionDef["group"]; label: string }[] = [
  { key: "manage", label: "Can manage" },
  { key: "board", label: "Board powers" },
  { key: "setup", label: "Club setup" },
  { key: "settings", label: "Settings (Board)" },
];

export type ProfileBase = Exclude<MemberRole, "super_admin">;

export interface AccessProfile {
  id: string;
  name: string;
  base_role: ProfileBase;
  permissions: string[];
  is_builtin: boolean;
}

export const BASE_LABEL: Record<ProfileBase, string> = { member: "Member", admin: "Board" };

// Built-ins first (Member, then Board), then the rest by name.
export function sortProfiles(profiles: AccessProfile[]): AccessProfile[] {
  return [...profiles].sort((a, b) => {
    if (a.is_builtin !== b.is_builtin) return a.is_builtin ? -1 : 1;
    if (a.is_builtin) return a.base_role === "member" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

// Which permissions mean anything for someone on this base: a member can be
// given Board powers; Board has those already, and alone gets the Settings
// ones.
export function permissionsForBase(base: MemberRole): PermissionDef[] {
  return PERMISSIONS.filter((p) => (base === "member" ? p.group !== "settings" : p.group !== "board"));
}

// The profile a person is on: theirs, or the built-in one for their role.
// Null for a super-admin.
export function profileOf(
  member: { role: MemberRole; access_profile_id: string | null },
  profiles: AccessProfile[]
): AccessProfile | null {
  if (member.role === "super_admin") return null;
  return (
    (member.access_profile_id && profiles.find((p) => p.id === member.access_profile_id)) ||
    profiles.find((p) => p.is_builtin && p.base_role === member.role) ||
    null
  );
}

// The grant booleans permissions.ts checks, from a list of permission keys.
export function grantsFromPermissions(perms: Iterable<string>): Partial<MemberLike> {
  const held = new Set(perms);
  const out: Partial<MemberLike> = { permissions: [...held] };
  for (const p of PERMISSIONS) if (p.legacyColumn) out[p.legacyColumn] = held.has(p.key);
  return out;
}
