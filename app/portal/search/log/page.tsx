// Search log (super-admins): every question asked on the Search page
// (/portal/search) and what became of it, from search_log (migration 0112).
// The view is SearchLogView; this page checks who's asking, reads the
// filters and loads the period's questions.
//
//   /portal/search/log?days=7|30|90&show=all|no_answer|clarified|problems&q=…

import { redirect } from "next/navigation";
import { getViewer } from "../../../../lib/auth/viewer";
import { loadSearchLog } from "../../../../lib/portal-search/log-data";
import { FILTERS, PERIODS, SearchLogView } from "./SearchLogView";

export const dynamic = "force-dynamic";

export default async function SearchLogPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const viewer = await getViewer();
  if (!viewer?.isSuperAdmin) redirect("/portal/search");

  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const days = PERIODS.find((d) => String(d) === one(params.days)) ?? 30;
  const filter = FILTERS.find((f) => f.id === one(params.show))?.id ?? "all";
  const text = one(params.q).trim().slice(0, 100);
  const { rows, error } = await loadSearchLog(days);
  return <SearchLogView rows={rows} error={error} days={days} filter={filter} text={text} />;
}
