import { notFound, redirect } from "next/navigation";
import { createClient } from "../../../../lib/supabase/server";
import { isStaff, isSuperAdmin, type MemberLike } from "../../../../lib/auth/permissions";
import { loadMembers, loadRelationships } from "../_shared/data";
import { computeHouseholds, findBirthFamilyFor, findFamilyFor } from "../_shared/households";
import { lastNameLower } from "../_shared/format";
import { MemberDetail } from "./MemberDetail";

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

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
    .select("id, user_id, email, full_name, nickname, avatar_url, phone, home_phone, birthday, anniversary, address, directory_category, deceased_at, status, deleted_at")
    .eq("id", id)
    .maybeSingle();
  const member = (memberRow as (DetailMember & { deleted_at: string | null }) | null) ?? null;
  if (!member) notFound();
  if (member.deleted_at) notFound();

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
      .in("id", relatedIds)
      .eq("status", "approved");
    related = (relatedRows as typeof related | null) ?? [];
  }
  const nameById = new Map(related.map((m) => [m.id, m.full_name ?? m.email ?? "Unknown"]));
  const visibleRels = rels.filter((r) => nameById.has(r.related_member_id));

  // Resolve this member's family + load full directory for the inline admin
  // editor (relationship picker needs every candidate; all-rels needed so the
  // edit form can show existing links on whichever side of the join they sit).
  const [allMembers, allRels] = await Promise.all([
    loadMembers({ categories: ["regular", "extended"] }),
    loadRelationships(),
  ]);
  const households = computeHouseholds(allMembers, allRels);
  const familyHousehold = findFamilyFor(households, id);
  const family = familyHousehold
    ? {
        headId: familyHousehold.heads[0].id,
        name: capitalize(lastNameLower(familyHousehold.heads[0])) || "Family",
      }
    : null;

  // Maiden / birth family — only shown when it's a different household than
  // the current family (e.g. a married woman keeps her maiden surname here).
  const parentIds = rels
    .filter((r) => r.relationship === "parent")
    .map((r) => r.related_member_id);
  const birthHousehold = findBirthFamilyFor(households, parentIds);
  const birthFamily =
    birthHousehold && birthHousehold.key !== familyHousehold?.key
      ? {
          headId: birthHousehold.heads[0].id,
          name: capitalize(lastNameLower(birthHousehold.heads[0])) || "Family",
        }
      : null;

  // Lightweight shapes for the edit form — strip what it doesn't need.
  const editMembers = allMembers.map((m) => ({
    id: m.id,
    email: m.email,
    full_name: m.full_name,
    avatar_url: m.avatar_url,
    phone: m.phone,
    birthday: m.birthday,
  }));
  // Need IDs on the relationships for the X buttons in the edit form. The
  // shared loadRelationships() doesn't return id — pull them separately.
  const { data: relRowsWithId } = await supabase
    .from("member_relationships")
    .select("id, member_id, related_member_id, relationship");
  const editRelationships = (relRowsWithId ?? []) as {
    id: string;
    member_id: string;
    related_member_id: string;
    relationship: "spouse" | "parent" | "child";
  }[];

  return (
    <MemberDetail
      member={member}
      relationships={visibleRels.map((r) => ({
        relatedId: r.related_member_id,
        relatedName: nameById.get(r.related_member_id) ?? "Unknown",
        relationship: r.relationship,
      }))}
      family={family}
      birthFamily={birthFamily}
      allMembers={editMembers}
      allRelationships={editRelationships}
      isSelf={member.user_id === user.id}
      isSuperAdmin={isSuperAdmin(me)}
    />
  );
}
