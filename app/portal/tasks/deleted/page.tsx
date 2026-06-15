import Link from "next/link";
import { redirect } from "next/navigation";
import { Icons } from "../../../components/icons";
import { createClient } from "../../../../lib/supabase/server";
import { isSuperAdmin, type MemberLike } from "../../../../lib/auth/permissions";
import { DeletedActions } from "./Actions";
import { memberDisplayName } from "../../../../lib/members/display";

interface DeletedTicket {
  id: string;
  description: string;
  status: "open" | "in_progress" | "done" | "cancelled";
  created_at: string;
  deleted_at: string;
  submitted_by: string | null;
  area: { name: string } | null;
  priority: { label: string; chip_class: string } | null;
}

export default async function DeletedMaintenancePage() {
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
  const me = (meRow as MemberLike | null) ?? null;
  if (!isSuperAdmin(me)) redirect("/portal/tasks");

  // RLS only lets super-admins see soft-deleted rows; we pass deleted_at IS
  // NOT NULL to switch the active staff/self policies off.
  const { data: ticketsRaw } = await supabase
    .from("maintenance_requests")
    .select(
      `id, description, status, created_at, deleted_at, submitted_by,
       area:areas(name),
       priority:priorities(label, chip_class)`
    )
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false });
  const tickets = (ticketsRaw as unknown as DeletedTicket[]) ?? [];

  // Submitter names for staff visibility.
  const submitterIds = Array.from(
    new Set(tickets.map((t) => t.submitted_by).filter((v): v is string => Boolean(v)))
  );
  const submitterMap: Record<string, { full_name: string | null; nickname: string | null; email: string }> = {};
  if (submitterIds.length > 0) {
    const { data: submitters } = await supabase
      .from("members")
      .select("user_id, full_name, nickname, email")
      .in("user_id", submitterIds);
    for (const s of submitters ?? []) {
      submitterMap[s.user_id] = { full_name: s.full_name, nickname: s.nickname, email: s.email };
    }
  }

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <Link
          href="/portal/tasks"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 16px",
            borderRadius: 100,
            background: "var(--gw-bg-elev)",
            color: "var(--gw-fg)",
            border: "1px solid var(--gw-border)",
            fontSize: 13,
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          <Icons.ChevronLeft width={14} height={14} />
          Back to queue
        </Link>
      </div>

      <div className="rsd-card" style={{ gap: 0, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--gw-border)" }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
            {tickets.length} {tickets.length === 1 ? "request" : "requests"}
          </h3>
        </div>
        {tickets.length === 0 ? (
          <div style={{ padding: "48px 24px", textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--gw-fg)", marginBottom: 6 }}>
              No deleted requests
            </div>
            <div style={{ fontSize: 13, color: "var(--gw-fg-muted)" }}>
              Soft-deleted tickets appear here. Restore brings them back to the queue; Delete forever
              removes the row permanently.
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {tickets.map((t) => {
              const submitter = t.submitted_by ? submitterMap[t.submitted_by] : null;
              return (
                <div
                  key={t.id}
                  style={{
                    display: "flex",
                    gap: 14,
                    padding: "14px 18px",
                    borderBottom: "1px solid var(--gw-border)",
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap",
                        marginBottom: 4,
                        alignItems: "center",
                      }}
                    >
                      {t.priority && (
                        <span className={`rsd-chip ${t.priority.chip_class}`}>{t.priority.label}</span>
                      )}
                      {statusChip(t.status)}
                      {t.area && (
                        <span style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 600 }}>
                          {t.area.name}
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        color: "var(--gw-fg)",
                        fontWeight: 600,
                        lineHeight: 1.4,
                        maxWidth: 520,
                      }}
                    >
                      {truncate(t.description, 140)}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 500, marginTop: 4 }}>
                      Submitted{" "}
                      {submitter ? `by ${memberDisplayName(submitter)}` : "(unknown)"} on{" "}
                      {formatDate(t.created_at)} · Deleted {formatDate(t.deleted_at)}
                    </div>
                  </div>
                  <DeletedActions ticketId={t.id} description={truncate(t.description, 60)} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

function statusChip(s: DeletedTicket["status"]) {
  if (s === "open") return <span className="rsd-chip rsd-chip-warn">Open</span>;
  if (s === "in_progress") return <span className="rsd-chip rsd-chip-accent">In Progress</span>;
  if (s === "cancelled") return <span className="rsd-chip rsd-chip-mute">Cancelled</span>;
  return <span className="rsd-chip rsd-chip-success">Done</span>;
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + "…";
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
