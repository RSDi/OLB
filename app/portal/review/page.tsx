import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import { isStaff, type MemberLike } from "../../../lib/auth/permissions";

type ReviewFilter = "pending_review" | "approved" | "declined";

const TABS: { key: ReviewFilter; label: string }[] = [
  { key: "pending_review", label: "Needs review" },
  { key: "approved", label: "Approved" },
  { key: "declined", label: "Declined" },
];

interface ReviewRow {
  id: string;
  description: string;
  created_at: string;
  submitted_by: string | null;
  review_status: ReviewFilter;
  details: Record<string, unknown> | null;
  category: { name: string; chip_class: string } | null;
}

export default async function ReviewQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const status: ReviewFilter = isValid(params.status) ? params.status : "pending_review";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: meRow } = await supabase
    .from("members")
    .select("role, status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!isStaff((meRow as MemberLike | null) ?? null)) redirect("/portal");

  // Scope to rows that came through the request wizard (details is non-null) so
  // the review queue is about member requests, not every internal task.
  const { data: rowsRaw } = await supabase
    .from("maintenance_requests")
    .select(
      `id, description, created_at, submitted_by, review_status, details,
       category:task_categories(name, chip_class)`
    )
    .is("deleted_at", null)
    .not("details", "is", null)
    .eq("review_status", status)
    .order("created_at", { ascending: false });
  const rows = (rowsRaw as unknown as ReviewRow[]) ?? [];

  const { count: pendingCount } = await supabase
    .from("maintenance_requests")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null)
    .not("details", "is", null)
    .eq("review_status", "pending_review");

  const ids = Array.from(new Set(rows.map((r) => r.submitted_by).filter((v): v is string => Boolean(v))));
  const submitterMap: Record<string, string> = {};
  if (ids.length > 0) {
    const { data: subs } = await supabase
      .from("members")
      .select("user_id, full_name, email")
      .in("user_id", ids);
    for (const s of subs ?? []) submitterMap[s.user_id] = s.full_name ?? s.email;
  }

  return (
    <>
      <p style={{ margin: "0 0 4px", fontSize: 14, color: "var(--gw-fg-muted)", lineHeight: 1.6, maxWidth: 620 }}>
        Requests from members waiting on the building committee. Open one to see the details, discuss in
        the thread, and approve or decline with a reason.
      </p>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
        {TABS.map((t) => {
          const active = status === t.key;
          const href = t.key === "pending_review" ? "/portal/review" : `/portal/review?status=${t.key}`;
          return (
            <Link
              key={t.key}
              href={href}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                background: active ? "var(--gw-bg-elev)" : "transparent",
                border: "1px solid",
                borderColor: active ? "var(--gw-border)" : "transparent",
                fontSize: 13,
                fontWeight: 700,
                color: active ? "var(--gw-fg)" : "var(--gw-fg-muted)",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              {t.label}
              {t.key === "pending_review" && (pendingCount ?? 0) > 0 && (
                <span
                  style={{
                    background: "var(--gw-error)",
                    color: "#fff",
                    fontSize: 10,
                    fontWeight: 800,
                    borderRadius: 100,
                    padding: "2px 6px",
                    lineHeight: 1.3,
                  }}
                >
                  {pendingCount}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {/* List */}
      {rows.length === 0 ? (
        <div className="rsd-card" style={{ padding: "48px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--gw-fg)", marginBottom: 6 }}>Nothing here</div>
          <div style={{ fontSize: 13, color: "var(--gw-fg-muted)" }}>
            {status === "pending_review" ? "No requests are waiting for review." : `No ${labelFor(status).toLowerCase()} requests.`}
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.map((r) => (
            <Link
              key={r.id}
              href={`/portal/tasks/${r.id}`}
              className="rsd-card gw-press"
              style={{ textDecoration: "none", color: "var(--gw-fg)", gap: 10 }}
            >
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {r.category && <span className={`rsd-chip ${r.category.chip_class}`}>{r.category.name}</span>}
                {flagChips(r.details)}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--gw-fg)", lineHeight: 1.5 }}>
                {firstLine(r.description)}
              </div>
              <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 500, display: "flex", gap: 12, flexWrap: "wrap" }}>
                <span>{r.submitted_by ? submitterMap[r.submitted_by] ?? "Unknown" : "Unknown"}</span>
                <span>· {formatDate(r.created_at)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

function flagChips(d: Record<string, unknown> | null) {
  if (!d) return null;
  const chips: string[] = [];
  if (d.requesterKind === "outside") chips.push("Outside group");
  if (d.recurring) chips.push("Recurring");
  if (typeof d.children === "string" && d.children.trim()) chips.push("Children");
  const spaces = Array.isArray(d.spaces) ? (d.spaces as string[]) : [];
  const needs = Array.isArray(d.needs) ? (d.needs as string[]) : [];
  if (spaces.includes("Kitchen") || needs.includes("Kitchen")) chips.push("Kitchen");
  if (d.paidActivity) chips.push("Paid");
  return chips.map((c) => (
    <span key={c} className="rsd-chip rsd-chip-mute">
      {c}
    </span>
  ));
}

function isValid(s: string | undefined): s is ReviewFilter {
  return s === "pending_review" || s === "approved" || s === "declined";
}

function labelFor(s: ReviewFilter): string {
  return TABS.find((t) => t.key === s)?.label ?? "";
}

function firstLine(s: string): string {
  return s.split("\n")[0];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
