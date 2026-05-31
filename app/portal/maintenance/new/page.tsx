import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../../../lib/supabase/server";
import { Icons } from "../../../components/icons";
import { MaintenanceRequestForm } from "./Form";

export default async function NewMaintenanceRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ description?: string }>;
}) {
  const { description } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: areas }, { data: priorities }] = await Promise.all([
    supabase
      .from("areas")
      .select("id, name")
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("priorities")
      .select("id, label, chip_class")
      .is("deleted_at", null)
      .order("severity", { ascending: true }),
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
          href="/portal/maintenance"
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
          Back to queue
        </Link>
      </div>

      <div style={{ maxWidth: 680 }}>
        <div className="rsd-card">
          <MaintenanceRequestForm
            areas={areas ?? []}
            priorities={priorities ?? []}
            initialDescription={description ?? ""}
          />
        </div>
      </div>
    </>
  );
}
