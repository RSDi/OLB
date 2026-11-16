import { redirect } from "next/navigation";
import { getAuthUser, getViewer } from "../../../lib/auth/viewer";
import { listHelpRequests } from "../../../lib/help-requests/actions";
import { HelpRequestsView } from "./HelpRequestsView";

export const dynamic = "force-dynamic";

// Help Requests: everything people sent with ? → Ask for help, for the board
// to answer. Each one is also posted in #olb-help on Slack.
export default async function HelpRequestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getAuthUser();
  if (!user) redirect("/login?next=/portal/help-requests");
  const viewer = await getViewer();
  if (!viewer?.isStaff) redirect("/portal");

  const res = await listHelpRequests("open");
  const raw = (await searchParams).open;
  const openId = typeof raw === "string" && /^[0-9a-f-]{36}$/i.test(raw) ? raw : null;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 22 }}>Help Requests</h1>
        <p className="rsd-muted" style={{ margin: "8px 0 0", maxWidth: 640 }}>
          What people sent with <strong>?</strong> → <strong>Ask for help</strong>. Each one is posted in{" "}
          <strong>#olb-help</strong> on Slack too. Your reply shows up under their <strong>My requests</strong>.
        </p>
      </div>
      <HelpRequestsView initial={"requests" in res ? res.requests : []} loadError={"requests" in res ? null : res.error} initialOpenId={openId} />
    </div>
  );
}
