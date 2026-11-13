// Every public page counts in Settings → Website Activity. Pages under
// app/(site) get the page-view beacon from that layout; the Shootout's pages
// get it from app/(standalone)/shootout/layout.tsx. A new public page outside
// both fails here until it's tracked or listed below with a reason.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const APP = join(process.cwd(), "app");

// Layouts that carry the beacon, and the folders they cover.
const TRACKED = ["(site)", join("(standalone)", "shootout")];

// Not public website pages: private links, the portal and its sign-in, APIs.
const NOT_TRACKED = [
  "portal", // the portal has its own activity trail
  "api",
  "auth",
  join("(standalone)", "directory"), // a private share link
  join("(standalone)", "roadmap"), // a private share link
  "film", // coaches' film upload, behind a team code
  "t", // coaches' film upload, behind a team code
  "invoice", // a family's private invoice link
];

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return pages(p);
    return name === "page.tsx" ? [relative(APP, p)] : [];
  });
}

const under = (file: string, folder: string) => file === folder || file.startsWith(folder + sep);

test("every public page is tracked in Website Activity, or listed as private", () => {
  const missing = pages(APP).filter((f) => ![...TRACKED, ...NOT_TRACKED].some((folder) => under(f, folder)));
  assert.deepEqual(missing, [], "Add the WebsiteBeacon to these pages' layout, or list them in NOT_TRACKED with a reason");
});

test("the tracked layouts carry the beacon", () => {
  for (const folder of TRACKED) {
    const layout = readFileSync(join(APP, folder, "layout.tsx"), "utf8");
    assert.match(layout, /<WebsiteBeacon\b/, `${folder}/layout.tsx should render <WebsiteBeacon />`);
  }
});
