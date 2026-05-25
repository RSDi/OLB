// Shared data fetching + types for all /portal/directory/* views. The leading
// underscore on the folder name excludes it from Next.js routing.

import { redirect } from "next/navigation";
import { createClient } from "../../../../lib/supabase/server";
import { isStaff, isSuperAdmin, type MemberLike } from "../../../../lib/auth/permissions";

export type DirectoryCategory = "regular" | "extended" | "memorial";

export interface DirectoryMember {
  id: string;
  user_id: string | null;
  email: string | null;
  full_name: string | null;
  nickname: string | null;
  avatar_url: string | null;
  phone: string | null;
  home_phone: string | null;
  birthday: string | null;
  anniversary: string | null;
  address: string | null;
  directory_category: DirectoryCategory;
  deceased_at: string | null;
}

export interface DirectoryRelationship {
  member_id: string;
  related_member_id: string;
  relationship: "spouse" | "parent" | "child";
}

export interface DirectoryViewer {
  memberId: string;
  userId: string;
  isStaff: boolean;
  isSuperAdmin: boolean;
}

// Auth + access guard reused across every view. Redirects to /login if no
// session. Returns null if the viewer isn't approved/staff (caller renders
// an inline notice).
export async function loadViewer(): Promise<DirectoryViewer | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: meRow } = await supabase
    .from("members")
    .select("id, role, status")
    .eq("user_id", user.id)
    .maybeSingle();
  const me = (meRow as (MemberLike & { id: string }) | null) ?? null;
  if (!me) return null;
  if (me.status !== "approved" && !isStaff(me)) return null;
  return {
    memberId: me.id,
    userId: user.id,
    isStaff: isStaff(me),
    isSuperAdmin: isSuperAdmin(me),
  };
}

const MEMBER_COLUMNS =
  "id, user_id, email, full_name, nickname, avatar_url, phone, home_phone, birthday, anniversary, address, directory_category, deceased_at";

export async function loadMembers(opts: {
  categories?: DirectoryCategory[];
  includeMemorials?: boolean;
}): Promise<DirectoryMember[]> {
  const supabase = await createClient();
  let q = supabase
    .from("members")
    .select(MEMBER_COLUMNS)
    .eq("status", "approved")
    .is("deleted_at", null);
  if (opts.categories) q = q.in("directory_category", opts.categories);
  else if (!opts.includeMemorials) q = q.neq("directory_category", "memorial");
  const { data } = await q.order("full_name", { ascending: true });
  return (data as DirectoryMember[] | null) ?? [];
}

export async function loadRelationships(): Promise<DirectoryRelationship[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("member_relationships")
    .select("member_id, related_member_id, relationship");
  return (data as DirectoryRelationship[] | null) ?? [];
}
