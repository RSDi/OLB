import Link from "next/link";
import { redirect } from "next/navigation";
import { Icons } from "../../../components/icons";
import { createClient } from "../../../../lib/supabase/server";
import { isStaff, type MemberLike } from "../../../../lib/auth/permissions";
import { loadRunnableProcedures } from "../../../../lib/playbooks/procedures-data";
import { EventForm } from "../EventForm";

export default async function NewEventPage() {
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
  if (!isStaff((meRow as MemberLike | null) ?? null)) redirect("/portal/events");

  const [{ data: areas }, { data: categories }, shutdownProcedures] = await Promise.all([
    supabase
      .from("areas")
      .select("id, name")
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("event_categories")
      .select("id, name, chip_class")
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    // Runnable procedures (0066) for the shutdown link, labeled "Playbook — Procedure".
    loadRunnableProcedures(),
  ]);

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <Link
          href="/portal/events"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 16px",
            borderRadius: 100,
            background: "var(--gw-bg-elev)",
            color: "var(--gw-fg)",
            border: "1px solid var(--gw-border)",
            fontSize: 13,
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          <Icons.ChevronLeft width={14} height={14} />
          Back to events
        </Link>
      </div>

      <EventForm
        areas={areas ?? []}
        categories={categories ?? []}
        shutdownProcedures={shutdownProcedures}
      />
    </>
  );
}
