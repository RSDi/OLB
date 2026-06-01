import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "../../../../lib/supabase/server";
import { Icons } from "../../../components/icons";
import { TrackWizard } from "../_shared/TrackWizard";

const VALID = ["use-a-space", "event", "class", "maintenance", "question"];

export default async function RequestTrackPage({
  params,
}: {
  params: Promise<{ track: string }>;
}) {
  const { track } = await params;
  if (!VALID.includes(track)) notFound();

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
        <TrackWizard trackKey={track} requesterName={member?.full_name ?? null} />
      </div>
    </>
  );
}
