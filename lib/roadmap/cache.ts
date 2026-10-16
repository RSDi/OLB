// Shared board refresh after a roadmap write. The portal page can be served
// from the Full Route Cache / client router cache; the public share page is
// a different path. POST, PATCH, and the board actions all call this so a
// bot status move does not leave /portal/roadmap looking stale.

import { revalidatePath } from "next/cache";

export function refreshRoadmap() {
  revalidatePath("/portal/roadmap");
  revalidatePath("/portal/roadmap", "layout");
  revalidatePath("/roadmap/[key]", "page");
}
