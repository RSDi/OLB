// The live page's printable signs (0165), as a PDF: Print the signs on the
// Brackets tab's Live scores box opens it. One sign per Letter page, edge to
// edge, the same in every browser. For the HS Schedule's planners. The PIN is
// never printed.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "../../../../lib/auth/viewer";
import { viewerHsScheduleAccess } from "../../../../lib/hs-schedule/viewer";
import { createClient } from "../../../../lib/supabase/server";
import { buildSignsPdf, signsDatesLabel, type SignsAssets } from "../../../../lib/hosted/signs-pdf";

export const dynamic = "force-dynamic";

const LIVE_URL = "https://omahalightningbasketball.com/shootout";
// Bundled with this route via outputFileTracingIncludes in next.config.ts.
const ASSETS = join(process.cwd(), "lib/hosted/signs-assets");

let assets: Promise<SignsAssets> | null = null;
function loadAssets(): Promise<SignsAssets> {
  assets ??= Promise.all(
    ["BarlowCondensed-ExtraBold.ttf", "Barlow-Regular.ttf", "Barlow-SemiBold.ttf", "Barlow-Bold.ttf", "logo-bolt.png"].map((f) => readFile(join(ASSETS, f)))
  ).then(([display, regular, semibold, bold, bolt]) => ({ display, regular, semibold, bold, bolt }));
  return assets;
}

export async function GET(request: NextRequest) {
  const w = request.nextUrl.searchParams.get("w");
  const viewer = await getViewer();
  if (!viewer) {
    const next = `/shootout/signs${w ? `?w=${w}` : ""}`;
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(next)}`, request.url));
  }
  const notFound = () => new NextResponse("Not found", { status: 404 });
  if ((await viewerHsScheduleAccess(viewer)) !== "edit") return notFound();
  if (!w || !/^[0-9a-f-]{36}$/i.test(w)) return notFound();
  const db = await createClient();
  const [{ data: wk }, { data: plan }, { data: games }] = await Promise.all([
    db.from("hs_weekends").select("event, starts_on, ends_on").eq("id", w).maybeSingle(),
    db.from("hs_hosted").select("courts, facility, admission").eq("weekend_id", w).maybeSingle(),
    db.from("hs_hosted_games").select("plays_on, court").eq("weekend_id", w),
  ]);
  const weekend = wk as { event: string; starts_on: string; ends_on: string } | null;
  const p = plan as { courts: number; facility: string | null; admission: string | null } | null;
  if (!weekend || !p) return notFound();
  const gs = (games as { plays_on: string | null; court: number | null }[] | null) ?? [];
  const days = gs.map((g) => g.plays_on).filter((d): d is string => !!d).sort();
  const pdf = await buildSignsPdf(
    {
      event: weekend.event,
      dateLine: signsDatesLabel(days[0] ?? weekend.starts_on, days[days.length - 1] ?? weekend.ends_on),
      place: p.facility?.split("\n")[0]?.trim() ?? "",
      admission: p.admission?.trim() || null,
      courts: Math.max(p.courts, ...gs.map((g) => g.court ?? 0)),
      liveUrl: LIVE_URL,
    },
    await loadAssets()
  );
  const name = `${weekend.event.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "Tournament"}-signs.pdf`;
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      "content-type": "application/pdf",
      // Opens in the browser's PDF viewer, where Print prints it as is.
      "content-disposition": `inline; filename="${name}"`,
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex",
    },
  });
}
