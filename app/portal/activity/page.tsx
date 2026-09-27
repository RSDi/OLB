// Activity (super-admins): who's using the portal — sign-ins, sessions, the
// pages people open, usage over the last 30 days — and "Preview as", to see
// the portal exactly as one member does. Data: lib/activity/queries.ts.
//
//   /portal/activity                 overview + members
//   /portal/activity?u=<user>        that member's sessions
//   /portal/activity?u=<user>&sid=…  one session, page by page

import { redirect } from "next/navigation";
import { getViewer } from "../../../lib/auth/viewer";
import { loadActivityOverview, loadSessionEvents, loadUserSessions } from "../../../lib/activity/queries";
import { ActivityOverview } from "./ActivityOverview";
import { SessionTimeline, SessionsList } from "./SessionViews";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function one(v: string | string[] | undefined): string | null {
  const s = Array.isArray(v) ? v[0] : v;
  return s && UUID.test(s) ? s : null;
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const viewer = await getViewer();
  if (!viewer?.isSuperAdmin) redirect("/portal/directory");

  const params = await searchParams;
  const userId = one(params.u);
  const sid = one(params.sid);

  if (userId) {
    const { name, sessions, asOf, error } = await loadUserSessions(userId);
    if (sid) {
      const trail = await loadSessionEvents(userId, sid);
      return (
        <SessionTimeline
          userId={userId}
          name={name}
          session={sessions.find((s) => s.sid === sid) ?? null}
          events={trail.events}
          total={trail.total}
          now={asOf}
          error={trail.error}
        />
      );
    }
    return <SessionsList userId={userId} name={name} sessions={sessions} now={asOf} error={error} />;
  }

  const data = await loadActivityOverview();
  return <ActivityOverview data={data} viewerUserId={viewer.userId} />;
}
