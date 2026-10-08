import { draftMode } from "next/headers";
import { redirect } from "next/navigation";
import { previewPath } from "../../../../../lib/website/preview-path";

// Leaves the preview: back to the published site, on the same page.
export async function GET(request: Request) {
  (await draftMode()).disable();
  redirect(previewPath(new URL(request.url).searchParams.get("path")));
}
