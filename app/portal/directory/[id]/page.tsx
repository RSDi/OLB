import { notFound, redirect } from "next/navigation";
import { createClient } from "../../../../lib/supabase/server";
import { getViewer } from "../../../../lib/auth/viewer";
import { loadMembers, type DirectoryRelationship } from "../_shared/data";
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

type RelationshipRow = DirectoryRelationship & { id: string };

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Everything the page shows depends only on the route id, so it goes out as
  // one parallel batch rather than a chain of dependent round trips — and
  // before the viewer check, on purpose (see loadViewer() in ../_shared/data).
  const supabase = await createClient();
  const batch = Promise.all([
    supabase
      .from("members")
      .select("id, user_id, email, full_name, nickname, avatar_url, phone, home_phone, birthday, anniversary, address, directory_category, deceased_at, status, deleted_at")
      .eq("id", id)
      .maybeSingle(),
    // Every approved member, memorials included, so a relationship chip can
    // still name a spouse or parent who has passed. The family lookup and the
    // editor below use the non-memorial subset.
    loadMembers({ includeMemorials: true }),
    // With ids: the admin editor's remove buttons need them. One read serves
    // this member's own links, the family lookup, and the editor.
    supabase
      .from("member_relationships")
      .select("id, member_id, related_member_id, relationship"),
  ]);

  // Same per-request cached lookup the portal layout already made, so this
  // costs no extra auth or members round trip.
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.status !== "approved" && !viewer.isStaff) {
    redirect("/portal/directory");
  }

  const [[{ data: memberRow }, everyone, { data: relRows }], notesRes] = await Promise.all([
    batch,
    // Staff-only private notes (RLS returns nothing for non-staff viewers).
    viewer.isStaff
      ? supabase.from("members_notes").select("notes").eq("member_id", id).maybeSingle()
      : null,
  ]);

  const member = (memberRow as (DetailMember & { deleted_at: string | null }) | null) ?? null;
  if (!member) notFound();
  if (member.deleted_at) notFound();

  // Non-staff can only view approved members. (RLS already enforces this for
  // SELECT, but guard explicitly so we render notFound rather than a blank.)
  if (member.status !== "approved" && !viewer.isStaff) notFound();

  const allRels = (relRows as RelationshipRow[] | null) ?? [];
  const rels = allRels.filter((r) => r.member_id === id);
  const nameById = new Map(everyone.map((m) => [m.id, m.full_name ?? m.email ?? "Unknown"]));
  const visibleRels = rels.filter((r) => nameById.has(r.related_member_id));

  // Resolve this member's family from the directory proper (no memorials).
  const allMembers = everyone.filter((m) => m.directory_category !== "memorial");
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

  // The inline admin editor (super-admins only) needs every member and every
  // relationship for its pickers. Everyone else gets empty lists rather than
  // the whole directory serialized into their page.
  const editMembers = viewer.isSuperAdmin
    ? allMembers.map((m) => ({
        id: m.id,
        email: m.email,
        full_name: m.full_name,
        avatar_url: m.avatar_url,
        phone: m.phone,
        birthday: m.birthday,
      }))
    : [];
  const editRelationships = viewer.isSuperAdmin ? allRels : [];

  const notes = (notesRes?.data as { notes: string } | null)?.notes ?? "";

  return (
    <MemberDetail
      member={member}
      isStaff={viewer.isStaff}
      notes={notes}
      relationships={visibleRels.map((r) => ({
        relatedId: r.related_member_id,
        relatedName: nameById.get(r.related_member_id) ?? "Unknown",
        relationship: r.relationship,
      }))}
      family={family}
      birthFamily={birthFamily}
      allMembers={editMembers}
      allRelationships={editRelationships}
      isSelf={member.user_id === viewer.userId}
      isSuperAdmin={viewer.isSuperAdmin}
    />
  );
}
