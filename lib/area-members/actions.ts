"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "../supabase/server";

export type AreaMemberRole = "owner" | "helper";

export interface ActionResult {
  success?: boolean;
  error?: string;
}

export async function assignMemberToArea(
  memberId: string,
  areaId: string,
  role: AreaMemberRole
): Promise<ActionResult> {
  if (role !== "owner" && role !== "helper") return { error: "Invalid role." };

  const supabase = await createClient();

  // Upsert via insert with on_conflict — handles both new assignments and
  // role changes for an existing (area, member) pair.
  const { error } = await supabase
    .from("area_members")
    .upsert(
      { area_id: areaId, member_id: memberId, role },
      { onConflict: "area_id,member_id" }
    );
  if (error) return { error: error.message };

  revalidatePath("/portal/settings");
  return { success: true };
}

export async function removeMemberFromArea(
  memberId: string,
  areaId: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("area_members")
    .delete()
    .eq("area_id", areaId)
    .eq("member_id", memberId);
  if (error) return { error: error.message };

  revalidatePath("/portal/settings");
  return { success: true };
}
