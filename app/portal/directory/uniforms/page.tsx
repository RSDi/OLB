import { redirect } from "next/navigation";
import { getViewer } from "../../../../lib/auth/viewer";
import { loadUniformPage } from "../../../../lib/onboarding/uniform-data";
import { workflowEnabled } from "../../../../lib/onboarding/board-data";
import { UniformsView } from "./UniformsView";

// Uniforms (0130): the sizes families picked at registration, counted by
// item for the order, changed at try-on, and charged to families when the
// order goes in. For the uniforms permission and Registrations; the preview
// accounts, and everyone it's for while the registration workflow is on.
export default async function UniformsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  const allowed = viewer.isSuperAdmin || viewer.canManageRegistrations || viewer.permissions.includes("uniforms");
  if (!allowed || !(viewer.seesFullUi || (await workflowEnabled()))) redirect("/portal/directory");
  const data = await loadUniformPage();
  if (!data) {
    return (
      <div className="rsd-card" style={{ padding: "32px 24px", textAlign: "center" }}>
        This season&apos;s roster isn&apos;t set up yet.
      </div>
    );
  }
  return <UniformsView data={data} />;
}
