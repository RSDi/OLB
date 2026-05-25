import { notFound, redirect } from "next/navigation";
import { createClient } from "../../../../lib/supabase/server";
import { isStaff, isSuperAdmin, type MemberLike } from "../../../../lib/auth/permissions";
import { MemberDetail } from "./MemberDetail";

interface DetailMember {
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
  directory_category: "regular" | "extended" | "memorial";
  deceased_at: string | null;
  status: string;
}

interface RelatedRef {
  related_member_id: string;
  relationship: "spouse" | "parent" | "child";
}

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

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
  if (!me || (me.status !== "approved" && !isStaff(me))) {
    redirect("/portal/directory");
  }

  const { data: memberRow } = await supabase
    .from("members")
    .select("id, user_id, email, full_name, nickname, avatar_url, phone, home_phone, birthday, anniversary, address, directory_category, deceased_at, status")
    .eq("id", id)
    .maybeSingle();
  const member = (memberRow as DetailMember | null) ?? null;
  if (!member) notFound();

  // Non-staff can only view approved members. (RLS already enforces this for
  // SELECT, but guard explicitly so we render notFound rather than a blank.)
  if (member.status !== "approved" && !isStaff(me)) notFound();

  const { data: relRows } = await supabase
    .from("member_relationships")
    .select("related_member_id, relationship")
    .eq("member_id", id);
  const rels = (relRows as RelatedRef[] | null) ?? [];

  const relatedIds = [...new Set(rels.map((r) => r.related_member_id))];
  let related: { id: string; full_name: string | null; email: string | null }[] = [];
  if (relatedIds.length > 0) {
    const { data: relatedRows } = await supabase
      .from("members")
      .select("id, full_name, email")
      .in("id", relatedIds);
    related = (relatedRows as typeof related | null) ?? [];
  }
  const nameById = new Map(related.map((m) => [m.id, m.full_name ?? m.email ?? "Unknown"]));

  return (
    <MemberDetail
      member={member}
      relationships={rels.map((r) => ({
        relatedId: r.related_member_id,
        relatedName: nameById.get(r.related_member_id) ?? "Unknown",
        relationship: r.relationship,
      }))}
      isSelf={member.user_id === user.id}
      isSuperAdmin={isSuperAdmin(me)}
    />
  );
}
