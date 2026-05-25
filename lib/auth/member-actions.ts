"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../supabase/server";
import type { MemberRole, MemberStatus } from "./permissions";

export interface MemberActionResult {
  success?: boolean;
  error?: string;
  memberId?: string;
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

export async function removeMemberRelationship(
  memberId: string,
  relatedMemberId: string,
  kind: RelationshipKind
): Promise<MemberActionResult> {
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
