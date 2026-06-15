import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "../../../../lib/supabase/server";
import { Icons } from "../../../components/icons";
import { memberFirstName } from "../../../../lib/members/display";
import { TrackWizard } from "../_shared/TrackWizard";

const VALID = ["gym", "building-use", "maintenance", "question"];

export default async function RequestTrackPage({
  params,
  searchParams,
}: {
  params: Promise<{ track: string }>;
  searchParams: Promise<{ prior?: string }>;
}) {
  const { track } = await params;
  if (!VALID.includes(track)) notFound();

  // Steps already completed in a flow that handed off here (e.g. the building-use
  // "Sports" pick → this gym track), so the wizard's count stays continuous.
  const { prior } = await searchParams;
  const priorSteps = Math.min(10, Math.max(0, Number.parseInt(prior ?? "", 10) || 0));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: member } = await supabase
    .from("members")
    .select("full_name, nickname")
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
        <TrackWizard trackKey={track} requesterName={member ? memberFirstName(member) : null} priorSteps={priorSteps} />
      </div>
    </>
  );
}
