import Link from "next/link";
import { redirect } from "next/navigation";
import { Icons } from "../../components/icons";
import { createClient } from "../../../lib/supabase/server";
import { getAuthUser } from "../../../lib/auth/viewer";
import { isStaff, type MemberLike } from "../../../lib/auth/permissions";
import { memberDisplayName } from "../../../lib/members/display";

interface PlaybookRow {
  id: string;
  title: string;
  excerpt: string | null;
  updated_at: string;
  updated_by: string | null;
  category: { name: string; chip_class: string } | null;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function authorLabel(name: string | null | undefined): string {
  if (!name) return "Staff";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

export default async function PortalPlaybooksPage() {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const { data: meRow } = await supabase
    .from("members")
    .select("role, status")
    .eq("user_id", user.id)
    .maybeSingle();
  const me = (meRow as MemberLike | null) ?? null;
  const staff = isStaff(me);

  const { data: rows } = await supabase
    .from("playbooks")
    .select(
      `id, title, excerpt, updated_at, updated_by,
       category:playbook_categories(name, chip_class)`
    )
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  const playbooks = (rows as unknown as PlaybookRow[]) ?? [];

  // Resolve "last updated by" names from members. Second query (no FK between
  // playbooks.updated_by and members.user_id, so we can't nest the select).
  const updaterIds = [
    ...new Set(playbooks.map((p) => p.updated_by).filter((v): v is string => Boolean(v))),
  ];
  const nameByUid = new Map<string, string>();
  if (updaterIds.length > 0) {
    const { data: members } = await supabase
      .from("members")
      .select("user_id, full_name, nickname, email")
      .in("user_id", updaterIds);
    for (const m of ((members as unknown) as {
      user_id: string;
      full_name: string | null;
      nickname: string | null;
      email: string | null;
    }[]) ?? []) {
      nameByUid.set(m.user_id, memberDisplayName(m));
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
        {staff && (
          <Link
            href="/portal/docs/new"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 20px",
              borderRadius: 100,
              background: "var(--rsd-accent-fill)",
              color: "var(--rsd-accent-fill-on)",
              border: "none",
              fontSize: 13,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            <Icons.FileText width={14} height={14} />
            New Playbook
          </Link>
        )}
      </div>

      {playbooks.length === 0 ? (
        <div
          style={{
            marginTop: 24,
            padding: 40,
            textAlign: "center",
            border: "1px dashed var(--gw-border)",
            borderRadius: 12,
            color: "var(--gw-fg-muted)",
            fontSize: 13,
          }}
        >
          {staff
            ? "No playbooks yet. Click “New Playbook” to create the first one."
            : "No playbooks have been published yet."}
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: 16,
            marginTop: 20,
          }}
        >
          {playbooks.map((doc) => {
            const chip = doc.category?.chip_class ?? "rsd-chip-mute";
            const author = authorLabel(doc.updated_by ? nameByUid.get(doc.updated_by) : null);
            return (
              <Link
                key={doc.id}
                href={`/portal/docs/${doc.id}`}
                className="rsd-card gw-press"
                style={{
                  cursor: "pointer",
                  gap: 14,
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: "var(--gw-bg-elev)",
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--gw-fg-muted)",
                    }}
                  >
                    <Icons.BookOpen width={18} height={18} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: 15,
                        color: "var(--gw-fg)",
                        lineHeight: 1.3,
                      }}
                    >
                      {doc.title}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--gw-fg-muted)",
                        fontWeight: 500,
                        marginTop: 4,
                      }}
                    >
                      Updated {formatDate(doc.updated_at)} · {author}
                    </div>
                  </div>
                </div>
                {doc.excerpt && (
                  <p
                    style={{
                      margin: 0,
                      fontSize: 13,
                      color: "var(--gw-fg-muted)",
                      lineHeight: 1.65,
                      fontWeight: 500,
                    }}
                  >
                    {doc.excerpt}
                  </p>
                )}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingTop: 4,
                    borderTop: "1px solid var(--gw-border)",
                  }}
                >
                  <span className={`rsd-chip ${chip}`}>
                    {doc.category?.name ?? "Uncategorized"}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      color: "var(--rsd-accent)",
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    Open <Icons.ArrowRight width={12} height={12} />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
