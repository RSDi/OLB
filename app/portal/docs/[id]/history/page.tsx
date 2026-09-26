import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "../../../../../lib/supabase/server";
import { getAuthUser } from "../../../../../lib/auth/viewer";
import { isStaff, type MemberLike } from "../../../../../lib/auth/permissions";
import { memberDisplayName } from "../../../../../lib/members/display";
import { MarkdownView } from "../../../../components/MarkdownView";

interface VersionRow {
  id: string;
  version_number: number;
  title: string;
  excerpt: string | null;
  body_md: string;
  changed_by: string | null;
  changed_at: string;
  category: { name: string; chip_class: string } | null;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function authorLabel(name: string | null | undefined): string {
  if (!name) return "Staff";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

export default async function PlaybookHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const user = await getAuthUser();
  if (!user) redirect("/login");

  const { data: meRow } = await supabase
    .from("members")
    .select("role, status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!isStaff((meRow as MemberLike | null) ?? null)) redirect("/portal/docs");

  const { data: pb } = await supabase
    .from("playbooks")
    .select("id, title")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  const playbook = (pb as { id: string; title: string } | null) ?? null;
  if (!playbook) notFound();

  const { data: rows } = await supabase
    .from("playbook_versions")
    .select(
      `id, version_number, title, excerpt, body_md, changed_by, changed_at,
       category:playbook_categories(name, chip_class)`
    )
    .eq("playbook_id", id)
    .order("version_number", { ascending: false });
  const versions = ((rows as unknown) as VersionRow[]) ?? [];

  const editorIds = [
    ...new Set(versions.map((v) => v.changed_by).filter((v): v is string => Boolean(v))),
  ];
  const nameByUid = new Map<string, string>();
  if (editorIds.length > 0) {
    const { data: members } = await supabase
      .from("members")
      .select("user_id, full_name, nickname, email")
      .in("user_id", editorIds);
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
      <div>
        <div className="rsd-eyebrow" style={{ marginBottom: 6 }}>
          <Link
            href={`/portal/docs/${id}`}
            style={{ color: "inherit", textDecoration: "none" }}
          >
            ← {playbook.title}
          </Link>
        </div>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-.02em" }}>
          Version history
        </h2>
        <div
          style={{
            fontSize: 12,
            color: "var(--gw-fg-muted)",
            fontWeight: 500,
            marginTop: 6,
          }}
        >
          {versions.length} version{versions.length === 1 ? "" : "s"} · newest first
        </div>
      </div>

      {versions.length === 0 ? (
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
          No history yet.
        </div>
      ) : (
        <div
          style={{
            marginTop: 20,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {versions.map((v) => {
            const chip = v.category?.chip_class ?? "rsd-chip-mute";
            const author = authorLabel(v.changed_by ? nameByUid.get(v.changed_by) : null);
            return (
              <details
                key={v.id}
                style={{
                  background: "var(--gw-bg-elev)",
                  border: "1px solid var(--gw-border)",
                  borderRadius: 12,
                  padding: "14px 18px",
                }}
              >
                <summary
                  style={{
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    listStyle: "none",
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      fontWeight: 800,
                      fontSize: 13,
                      color: "var(--rsd-accent)",
                      minWidth: 36,
                    }}
                  >
                    v{v.version_number}
                  </span>
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: 14,
                      color: "var(--gw-fg)",
                      flex: 1,
                      minWidth: 0,
                    }}
                  >
                    {v.title}
                  </span>
                  {v.category && (
                    <span className={`rsd-chip ${chip}`}>{v.category.name}</span>
                  )}
                  <span
                    style={{
                      fontSize: 12,
                      color: "var(--gw-fg-muted)",
                      fontWeight: 500,
                    }}
                  >
                    {formatDateTime(v.changed_at)} · {author}
                  </span>
                </summary>

                <div
                  style={{
                    marginTop: 14,
                    paddingTop: 14,
                    borderTop: "1px solid var(--gw-border)",
                  }}
                >
                  {v.excerpt && (
                    <p
                      style={{
                        margin: "0 0 16px",
                        fontSize: 13,
                        color: "var(--gw-fg-muted)",
                        fontStyle: "italic",
                        lineHeight: 1.55,
                      }}
                    >
                      {v.excerpt}
                    </p>
                  )}
                  <article
                    className="rsd-markdown"
                    style={{ fontSize: 14, lineHeight: 1.7, color: "var(--gw-fg)" }}
                  >
                    {v.body_md.trim() ? (
                      <MarkdownView>{v.body_md}</MarkdownView>
                    ) : (
                      <p style={{ margin: 0, color: "var(--gw-fg-muted)", fontStyle: "italic" }}>
                        (Empty body.)
                      </p>
                    )}
                  </article>
                </div>
              </details>
            );
          })}
        </div>
      )}
    </>
  );
}
