import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../../../lib/supabase/server";
import { Icons } from "../../../components/icons";
import { BuildingUseWizard } from "./Wizard";

export default async function BuildingUseRequestPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: member } = await supabase
    .from("members")
    .select("full_name")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 16 }}>
        <Link
          href="/portal/requests"
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
          All requests
        </Link>
      </div>

      <div style={{ maxWidth: 640 }}>
        <BuildingUseWizard requesterName={member?.full_name ?? null} />
      </div>
    </>
  );
}
