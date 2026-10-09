// Server-action authorization guards (A7 / finding S11).
//
// RLS is the real enforcement layer — these guards are defense-in-depth: a
// second, explicit check in TypeScript so an action fails fast with a clear
// message instead of leaning on a policy, and so a future RLS regression
// can't silently expose a mutation. Call at the top of any staff/super-admin
// server action:
//
//   const gate = await requireStaff();
//   if ("error" in gate) return { error: gate.error };

import { createClient } from "../supabase/server";
import { loadGrants } from "./load-grants";
import {
  isStaff,
  isSuperAdmin,
  canEditSettings,
  canDeleteSettings,
  canUndeleteSettings,
  canManageFinances,
  canManageRegistrations,
  canManageTravel,
  canSlackDm,
  canManageWebsite,
  canMemberNotes,
  canPlayerNotes,
  canCheckRequirements,
  canEditContacts,
  canManageTeams,
  canManageSiteLinks,
  type MemberLike,
  type MemberRole,
  type MemberStatus,
} from "./permissions";

type GateResult = { error: string } | { userId: string };

async function loadCaller(): Promise<{ userId: string; member: MemberLike | null } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("members")
    .select("id, role, status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data) return { userId: user.id, member: null };
  const row = data as { id: string; role: MemberRole; status: MemberStatus };
  // Best-effort, so the guards work ahead of a migration: a missing grant
  // reads as no access, the safe default.
  const grants = await loadGrants(supabase, user.id);
  return { userId: user.id, member: { ...grants, role: row.role, status: row.status } };
}

export async function requireStaff(): Promise<GateResult> {
  const caller = await loadCaller();
  if (!caller) return { error: "You must be signed in." };
  if (!isStaff(caller.member)) {
    return { error: "Board access required." };
  }
  return { userId: caller.userId };
}

export async function requireSuperAdmin(): Promise<GateResult> {
  const caller = await loadCaller();
  if (!caller) return { error: "You must be signed in." };
  if (!isSuperAdmin(caller.member)) {
    return { error: "Super-admin access required." };
  }
  return { userId: caller.userId };
}

// Settings grants (0057). A super-admin always passes; a board member needs
// the matching grant. Use these in settings create/update, soft-delete, and
// restore actions respectively.
export async function requireSettingsEdit(): Promise<GateResult> {
  const caller = await loadCaller();
  if (!caller) return { error: "You must be signed in." };
  if (!canEditSettings(caller.member)) {
    return { error: "You don't have permission to edit settings." };
  }
  return { userId: caller.userId };
}

export async function requireSettingsDelete(): Promise<GateResult> {
  const caller = await loadCaller();
  if (!caller) return { error: "You must be signed in." };
  if (!canDeleteSettings(caller.member)) {
    return { error: "You don't have permission to delete settings items." };
  }
  return { userId: caller.userId };
}

export async function requireSettingsUndelete(): Promise<GateResult> {
  const caller = await loadCaller();
  if (!caller) return { error: "You must be signed in." };
  if (!canUndeleteSettings(caller.member)) {
    return { error: "You don't have permission to restore items." };
  }
  return { userId: caller.userId };
}

// Payments (0101): the Treasurer and anyone else with the Payments grant.
export async function requireFinances(): Promise<GateResult> {
  const caller = await loadCaller();
  if (!caller) return { error: "You must be signed in." };
  if (!canManageFinances(caller.member)) {
    return { error: "You don't have permission to manage payments." };
  }
  return { userId: caller.userId };
}

// Registrations (0102): reviewing registrations, placing players on teams,
// editing and removing players.
export async function requireRegistrations(): Promise<GateResult> {
  const caller = await loadCaller();
  if (!caller) return { error: "You must be signed in." };
  if (!canManageRegistrations(caller.member)) {
    return { error: "You don't have permission to manage registrations." };
  }
  return { userId: caller.userId };
}

// Emailing families from the Directory (0116): the board, or anyone with the
// Registrations grant.
export async function requireFamilyEmail(): Promise<GateResult> {
  const caller = await loadCaller();
  if (!caller) return { error: "You must be signed in." };
  if (!isStaff(caller.member) && !canManageRegistrations(caller.member)) {
    return { error: "Only the board and people with the Registrations permission can email families." };
  }
  return { userId: caller.userId };
}

// Slack DMs to families from the Directory (0118): the grant holder,
// whoever they are. Super-admins always pass.
export async function requireSlackDm(): Promise<GateResult> {
  const caller = await loadCaller();
  if (!caller) return { error: "You must be signed in." };
  if (!canSlackDm(caller.member)) {
    return { error: "You don't have permission to send Slack DMs from the portal." };
  }
  return { userId: caller.userId };
}

// Settings → Website (0120): a board member with the Website grant, or a
// super-admin.
export async function requireWebsite(): Promise<GateResult> {
  const caller = await loadCaller();
  if (!caller) return { error: "You must be signed in." };
  if (!canManageWebsite(caller.member)) {
    return { error: "You don't have permission to edit the website." };
  }
  return { userId: caller.userId };
}

// The private Member notes on profiles: the board, or anyone with the Member
// notes permission (0123).
export async function requireMemberNotes(): Promise<GateResult> {
  const caller = await loadCaller();
  if (!caller) return { error: "You must be signed in." };
  if (!canMemberNotes(caller.member)) return { error: "You don't have permission to change member notes." };
  return { userId: caller.userId };
}

// Notes on players (0124): the board, or the Registrations permission.
export async function requirePlayerNotes(): Promise<GateResult> {
  const caller = await loadCaller();
  if (!caller) return { error: "You must be signed in." };
  if (!canPlayerNotes(caller.member)) return { error: "You don't have permission to add notes on players." };
  return { userId: caller.userId };
}

// Checking players off on requirements: the board, or anyone with the Check
// off requirements permission (0123).
export async function requireRequirementChecks(): Promise<GateResult> {
  const caller = await loadCaller();
  if (!caller) return { error: "You must be signed in." };
  if (!canCheckRequirements(caller.member)) {
    return { error: "You don't have permission to check players off on requirements." };
  }
  return { userId: caller.userId };
}

// Settings → Teams and Volunteer Roles, and filling team spots: a
// super-admin, or anyone with the Teams & volunteers permission (0123).
export async function requireTeams(): Promise<GateResult> {
  const caller = await loadCaller();
  if (!caller) return { error: "You must be signed in." };
  if (!canManageTeams(caller.member)) return { error: "You don't have permission to manage teams and volunteers." };
  return { userId: caller.userId };
}

// Settings → Sidebar Links and Public Directory: a super-admin, or anyone with
// the Sidebar Links & Public Directory permission (0123).
export async function requireSiteLinks(): Promise<GateResult> {
  const caller = await loadCaller();
  if (!caller) return { error: "You must be signed in." };
  if (!canManageSiteLinks(caller.member)) {
    return { error: "You don't have permission to change the sidebar links or the public Directory." };
  }
  return { userId: caller.userId };
}

// Adding and editing External Contacts: the board or anyone with the External
// Contacts permission (0123), or the travel coordinator (0110), whom RLS
// keeps to the travel types. `isStaff` is true for the first two: every type.
export async function requireContactEditor(): Promise<{ error: string } | { userId: string; isStaff: boolean }> {
  const caller = await loadCaller();
  if (!caller) return { error: "You must be signed in." };
  if (canEditContacts(caller.member)) return { userId: caller.userId, isStaff: true };
  if (canManageTravel(caller.member)) return { userId: caller.userId, isStaff: false };
  return { error: "Board access required." };
}
