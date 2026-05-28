import { redirect } from "next/navigation";
import { getViewer } from "../../../lib/auth/viewer";
import { DavesIdea } from "./DavesIdea";

export default async function DavesIdeaPage() {
  const viewer = await getViewer();
  if (!viewer?.isStaff) redirect("/portal");
  return <DavesIdea />;
}
