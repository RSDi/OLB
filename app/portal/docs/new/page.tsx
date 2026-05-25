import { redirect } from "next/navigation";
import { createClient } from "../../../../lib/supabase/server";
import { isStaff, type MemberLike } from "../../../../lib/auth/permissions";
import { NewPlaybookForm } from "./NewPlaybookForm";

export default async function NewPlaybookPage() {
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
  if (!isStaff((meRow as MemberLike | null) ?? null)) redirect("/portal/docs");

  const { data: cats } = await supabase
    .from("playbook_categories")
    .select("id, name, chip_class")
    .is("deleted_at", null)
    .order("sort_order")
    .order("name");
  const categories =
    ((cats as unknown) as { id: string; name: string; chip_class: string }[]) ?? [];

  return <NewPlaybookForm categories={categories} />;
}
