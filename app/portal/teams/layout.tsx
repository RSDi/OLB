import { redirect } from "next/navigation";
import { getViewer } from "../../../lib/auth/viewer";
import "../../components/olb.css";
import TeamsNav from "./_components/TeamsNav";

// Team manager (board, registrations, import) is super-admin only. The
// actions check again (lib/teams/guard.ts) and RLS on the olb_ tables
// (0089) is the final gate.
export default async function TeamsLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!viewer.isSuperAdmin) redirect("/portal");

  return (
    <div className="olb-root">
      <TeamsNav />
      {children}
    </div>
  );
}
