"use server";

import { revalidatePath } from "next/cache";
import { requireStaff, requireSuperAdmin } from "./guards";
import { createClient } from "../supabase/server";
import { createAdminClient } from "../supabase/admin";
import { isStaff, type MemberLike, type MemberRole, type MemberStatus } from "./permissions";
import { sendMembershipApprovedNotification } from "../notifications/membership-decision";

export interface MemberActionResult {
  success?: boolean;
  error?: string;
  memberId?: string;
}

// Approve / deny / restore a membership request. Any board member (staff)
// can do this — D1, backed by migration 0050's staff UPDATE policy + column
// guard. Approval emails the member so they know they're in, if they've signed
// in to ask.
export async function setMemberStatus(
  memberId: string,
  status: MemberStatus,
): Promise<MemberActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: meRow } = await supabase
    .from("members")
    .select("role, status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!isStaff((meRow as MemberLike | null) ?? null)) {
    return { error: "Only board members can review access requests." };
  }

  const { data: updated, error } = await supabase
    .from("members")
    .update({ status, reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .eq("id", memberId)
    .select("id, user_id, email, full_name, status")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!updated) return { error: "Member not found." };

  // Only someone who signed in and asked gets the "you're in" email; a
  // registered parent approved before they've signed up hears nothing.
  if (status === "approved" && (updated as { user_id: string | null }).user_id) {
    sendMembershipApprovedNotification({
      to: (updated as { email: string | null }).email,
      recipientName: (updated as { full_name: string | null }).full_name,
    }).catch((err) => console.error("[notify] membership email failed:", err));
  }

  revalidatePath("/portal/settings");
  return { success: true, memberId: updated.id as string };
}

export interface CreateMemberInput {
  fullName: string;
  email: string | null;
  phone: string | null;
  birthday: string | null; // YYYY-MM-DD
  role: MemberRole;
  status: MemberStatus;
}

export async function createMember(input: CreateMemberInput): Promise<MemberActionResult> {
  const gate = await requireSuperAdmin();
  if ("error" in gate) return { error: gate.error };
  if (!input.fullName.trim()) return { error: "Name is required." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("members")
    .insert({
      full_name: input.fullName.trim(),
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      birthday: input.birthday || null,
      role: input.role,
      status: input.status,
      reviewed_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Failed to create member." };

  revalidatePath("/portal/settings");
  return { success: true, memberId: data.id };
}

export type MembershipStatus = "visiting" | "regular" | "moved" | "inactive";

// Revoke a member's portal login (e.g. they left the church). Bans their auth
// account so the credential can't be used, stamps access_revoked_at, and
// records where they now stand (membership_status). Their directory entry and
// email are KEPT. Super-admin only. Reversible via restoreMemberLogin.
export async function revokeMemberLogin(
  memberId: string,
  membershipStatus: MembershipStatus = "inactive",
): Promise<MemberActionResult> {
  const gate = await requireSuperAdmin();
  if ("error" in gate) return { error: gate.error };

  const supabase = await createClient();
  const { data: target } = await supabase
    .from("members")
    .select("id, user_id")
    .eq("id", memberId)
    .maybeSingle();
  if (!target) return { error: "Member not found." };

  // Never let a super-admin revoke their own login (lockout guard) — the UI
  // hides this for self, but enforce it server-side too.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user && (target as { user_id: string | null }).user_id === user.id) {
    return { error: "You can't revoke your own login." };
  }

  // Ban the auth account so the credential can't be used. Deleting it isn't
  // safe — several tables FK to auth.users without cascade — and a ban is
  // reversible. Skipped when there's no linked account (an un-registered invite).
  const userId = (target as { user_id: string | null }).user_id;
  if (userId) {
    const admin = createAdminClient();
    const { error: banError } = await admin.auth.admin.updateUserById(userId, {
      ban_duration: "876000h", // ~100 years
    });
    if (banError) return { error: banError.message };
  }

  const { error } = await supabase
    .from("members")
    .update({
      access_revoked_at: new Date().toISOString(),
      membership_status: membershipStatus,
    })
    .eq("id", memberId);
  if (error) return { error: error.message };

  revalidatePath("/portal/settings");
  revalidatePath("/portal/directory");
  return { success: true, memberId };
}

// Restore a member's portal login: un-ban their auth account and clear
// access_revoked_at. Leaves membership_status alone (set it in the edit form).
// Super-admin only.
export async function restoreMemberLogin(memberId: string): Promise<MemberActionResult> {
  const gate = await requireSuperAdmin();
  if ("error" in gate) return { error: gate.error };

  const supabase = await createClient();
  const { data: target } = await supabase
    .from("members")
    .select("id, user_id")
    .eq("id", memberId)
    .maybeSingle();
  if (!target) return { error: "Member not found." };

  const userId = (target as { user_id: string | null }).user_id;
  if (userId) {
    const admin = createAdminClient();
    const { error: unbanError } = await admin.auth.admin.updateUserById(userId, {
      ban_duration: "none",
    });
    if (unbanError) return { error: unbanError.message };
  }

  const { error } = await supabase
    .from("members")
    .update({ access_revoked_at: null })
    .eq("id", memberId);
  if (error) return { error: error.message };

  revalidatePath("/portal/settings");
  revalidatePath("/portal/directory");
  return { success: true, memberId };
}

export type RelationshipKind = "spouse" | "parent" | "child";

// Map each side of a relationship to its inverse — what to also insert/delete
// on the related member so queries are simple either direction.
function inverseOf(kind: RelationshipKind): RelationshipKind {
  if (kind === "spouse") return "spouse";
  if (kind === "parent") return "child";
  return "parent";
}

export async function addMemberRelationship(
  memberId: string,
  relatedMemberId: string,
  kind: RelationshipKind
): Promise<MemberActionResult> {
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };
  if (memberId === relatedMemberId) {
    return { error: "Can't relate a member to themselves." };
  }

  const supabase = await createClient();
  const inverse = inverseOf(kind);

  // Insert both directions in one round-trip. ON CONFLICT (unique key) DO
  // NOTHING means re-running an add doesn't error.
  const { error } = await supabase.from("member_relationships").upsert(
    [
      { member_id: memberId, related_member_id: relatedMemberId, relationship: kind },
      { member_id: relatedMemberId, related_member_id: memberId, relationship: inverse },
    ],
    { onConflict: "member_id,related_member_id,relationship", ignoreDuplicates: true }
  );
  if (error) return { error: error.message };

  revalidatePath("/portal/settings");
  return { success: true };
}

export interface UpdateOwnProfileInput {
  fullName: string;
  nickname: string | null;
  phone: string | null;
  birthday: string | null; // YYYY-MM-DD
  avatarUrl: string | null;
}

// Self-update for the directory. The DB enforces the column firewall via
// the trigger from migration 0021 — this action just builds the patch and
// targets the row matching the signed-in user.
export async function updateOwnProfile(
  input: UpdateOwnProfileInput
): Promise<MemberActionResult> {
  if (!input.fullName.trim()) return { error: "Name is required." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase
    .from("members")
    .update({
      full_name: input.fullName.trim(),
      nickname: input.nickname?.trim() || null,
      phone: input.phone?.trim() || null,
      birthday: input.birthday || null,
      avatar_url: input.avatarUrl?.trim() || null,
    })
    .eq("user_id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/portal/directory");
  return { success: true };
}

export async function removeMemberRelationship(
  memberId: string,
  relatedMemberId: string,
  kind: RelationshipKind
): Promise<MemberActionResult> {
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };
  const supabase = await createClient();
  const inverse = inverseOf(kind);

  // Two deletes (postgrest doesn't have an OR-condition DELETE helper).
  const [a, b] = await Promise.all([
    supabase
      .from("member_relationships")
      .delete()
      .eq("member_id", memberId)
      .eq("related_member_id", relatedMemberId)
      .eq("relationship", kind),
    supabase
      .from("member_relationships")
      .delete()
      .eq("member_id", relatedMemberId)
      .eq("related_member_id", memberId)
      .eq("relationship", inverse),
  ]);
  if (a.error) return { error: a.error.message };
  if (b.error) return { error: b.error.message };

  revalidatePath("/portal/settings");
  return { success: true };
}

// Soft-delete sets deleted_at = NOW(). RLS hides the row from non-super-admin
// SELECTs; the column-restriction trigger blocks anyone but a super-admin
// from setting it.
export async function softDeleteMember(id: string): Promise<MemberActionResult> {
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: me } = await supabase
    .from("members")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (me && (me as { id: string }).id === id) {
    return { error: "You can't delete your own account." };
  }

  const { error } = await supabase
    .from("members")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/portal/settings");
  revalidatePath("/portal/directory");
  return { success: true };
}

export async function restoreMember(id: string): Promise<MemberActionResult> {
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("members")
    .update({ deleted_at: null })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/portal/settings");
  revalidatePath("/portal/directory");
  return { success: true };
}

// Hard delete — only callable on rows that are already soft-deleted. The
// guard happens server-side so a stale client can't escalate a soft-delete
// into a permanent one in a single click.
export async function hardDeleteMember(id: string): Promise<MemberActionResult> {
  const gate = await requireSuperAdmin();
  if ("error" in gate) return { error: gate.error };
  const supabase = await createClient();
  const { data: target } = await supabase
    .from("members")
    .select("id, deleted_at")
    .eq("id", id)
    .maybeSingle();
  if (!target) return { error: "Member not found." };
  if (!(target as { deleted_at: string | null }).deleted_at) {
    return { error: "Soft-delete the member first." };
  }

  // Re-assert the soft-deleted state in the DELETE itself so a concurrent
  // restore between the read above and this statement can't be overridden.
  const { error } = await supabase
    .from("members")
    .delete()
    .eq("id", id)
    .not("deleted_at", "is", null);
  if (error) return { error: error.message };

  revalidatePath("/portal/settings");
  return { success: true };
}

// Staff-only private notes about a member (members_notes is 1:1 per member,
// RLS-gated to staff). Upsert on the member_id primary key.
export async function updateMemberNotes(
  memberId: string,
  notes: string
): Promise<MemberActionResult> {
  const gate = await requireStaff();
  if ("error" in gate) return { error: gate.error };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase.from("members_notes").upsert(
    {
      member_id: memberId,
      notes,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "member_id" }
  );
  if (error) return { error: error.message };

  revalidatePath(`/portal/directory/${memberId}`);
  return { success: true };
}
