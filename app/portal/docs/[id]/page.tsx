import { notFound, redirect } from "next/navigation";
import { createClient } from "../../../../lib/supabase/server";
import { isStaff, isSuperAdmin, type MemberLike } from "../../../../lib/auth/permissions";
import { memberDisplayName } from "../../../../lib/members/display";
import { PlaybookDetail, type PlaybookDetailData } from "./PlaybookDetail";
import { loadProcedures, loadProcedureRuns, type ProcedureRun } from "../../../../lib/playbooks/procedures-data";
import {
  loadLinkedContactsForEntity,
  loadContactPickerOptions,
} from "../../contacts/_shared/data";

interface PlaybookRow {
  id: string;
  title: string;
  excerpt: string | null;
  body_md: string;
  updated_at: string;
  updated_by: string | null;
  created_at: string;
  created_by: string | null;
  category_id: string | null;
  category: { id: string; name: string; chip_class: string } | null;
}

export default async function PlaybookDetailPage({
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
    .select("role, status")
    .eq("user_id", user.id)
    .maybeSingle();
  const me = (meRow as MemberLike | null) ?? null;
  const staff = isStaff(me);

  const { data: row } = await supabase
    .from("playbooks")
    .select(
      `id, title, excerpt, body_md, updated_at, updated_by, created_at, created_by, category_id,
       category:playbook_categories(id, name, chip_class)`
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  const playbook = (row as unknown as PlaybookRow | null) ?? null;
  if (!playbook) notFound();

  // Resolve updater + creator member names. Two ids at most, but often the same.
  const uids = [playbook.updated_by, playbook.created_by].filter(
    (v): v is string => Boolean(v)
  );
  const nameByUid = new Map<string, string>();
  if (uids.length > 0) {
    const { data: members } = await supabase
      .from("members")
      .select("user_id, full_name, nickname, email")
      .in("user_id", [...new Set(uids)]);
    for (const m of ((members as unknown) as {
      user_id: string;
      full_name: string | null;
      nickname: string | null;
      email: string | null;
    }[]) ?? []) {
      nameByUid.set(m.user_id, memberDisplayName(m));
    }
  }

  // Version count — staff-only RLS, so skip the query for non-staff.
  let versionCount = 0;
  if (staff) {
    const { count } = await supabase
      .from("playbook_versions")
      .select("id", { count: "exact", head: true })
      .eq("playbook_id", id);
    versionCount = count ?? 0;
  }

  // Categories list for the edit form (staff only).
  let categories: { id: string; name: string; chip_class: string }[] = [];
  if (staff) {
    const { data: cats } = await supabase
      .from("playbook_categories")
      .select("id, name, chip_class")
      .is("deleted_at", null)
      .order("sort_order")
      .order("name");
    categories = ((cats as unknown) as typeof categories) ?? [];
  }

  // Procedures (0066) + their run history. Run history is staff-only (RLS),
  // so only fetch it for staff viewers.
  const procedures = await loadProcedures(playbook.id);
  let runsByProcedure: Record<string, ProcedureRun[]> = {};
  if (staff && procedures.length > 0) {
    const map = await loadProcedureRuns(procedures.map((p) => p.id));
    runsByProcedure = Object.fromEntries(map);
  }

  const data: PlaybookDetailData = {
    id: playbook.id,
    title: playbook.title,
    excerpt: playbook.excerpt,
    body_md: playbook.body_md,
    updated_at: playbook.updated_at,
    created_at: playbook.created_at,
    category: playbook.category,
    updated_by_name: playbook.updated_by ? nameByUid.get(playbook.updated_by) ?? null : null,
    created_by_name: playbook.created_by ? nameByUid.get(playbook.created_by) ?? null : null,
    version_count: versionCount,
    procedures,
    runsByProcedure,
  };

  // Vendors attached to this playbook — staff-only via RLS. Skip both
  // queries for non-staff so we don't pay the round-trip.
  const contactLinks = staff
    ? await loadLinkedContactsForEntity("playbook", playbook.id)
    : undefined;
  const contactPickerOptions = staff ? await loadContactPickerOptions() : undefined;

  return (
    <PlaybookDetail
      data={data}
      canEdit={staff}
      canDelete={isSuperAdmin(me)}
      categories={categories}
      contactLinks={contactLinks}
      contactPickerOptions={contactPickerOptions}
    />
  );
}
