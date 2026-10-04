"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "../../components/icons";
import { Input, Pill, Textarea } from "../../components/ui";
import { createClient } from "../../../lib/supabase/client";
import { createEmailTemplate, deleteEmailTemplate, updateEmailTemplate, type TemplateResult } from "../../../lib/teams/email-template-actions";
import {
  EMAIL_TEMPLATE_COLUMNS,
  TEMPLATE_BODY_MAX,
  TEMPLATE_NAME_MAX,
  TEMPLATE_SUBJECT_MAX,
  sortTemplates,
  type EmailTemplate,
  type EmailTemplateInput,
} from "../../../lib/teams/email-templates";
import { FAMILY_MESSAGE } from "../../../lib/teams/family-mail";
import { ErrorBox, IconBtn } from "./TeamsSettingsTab";

type TemplateRow = EmailTemplate & { updated_at: string; updated_by: string | null; updated_by_name?: string | null };

interface TemplatesData {
  rows: TemplateRow[];
  error: string | null;
}

async function fetchTemplates(): Promise<TemplatesData> {
  const supabase = createClient();
  const { data, error } = await supabase.from("olb_email_templates").select(`${EMAIL_TEMPLATE_COLUMNS}, updated_at, updated_by`);
  if (error) return { rows: [], error: error.message };
  const rows = (data as TemplateRow[] | null) ?? [];
  // Who last changed each one, by the name people know them by.
  const ids = [...new Set(rows.map((r) => r.updated_by).filter((id): id is string => !!id))];
  if (ids.length) {
    const { data: people } = await supabase.from("members").select("user_id, full_name, nickname").in("user_id", ids);
    const names = new Map(
      ((people as { user_id: string; full_name: string | null; nickname: string | null }[] | null) ?? []).map((m) => [
        m.user_id,
        m.nickname?.trim() || m.full_name?.split(" ")[0] || null,
      ])
    );
    for (const r of rows) r.updated_by_name = r.updated_by ? names.get(r.updated_by) ?? null : null;
  }
  return { rows: sortTemplates(rows), error: null };
}

// Settings → Email Templates: subjects and messages the board writes once
// and picks from when emailing families, on the Directory, a player's page
// and the registration waitlist. Any board member can add, edit and delete.
export function EmailTemplatesTab() {
  const router = useRouter();
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((d: TemplatesData) => {
    if (d.error) setError(d.error);
    else setRows(d.rows);
    setLoading(false);
  }, []);

  const load = useCallback(async () => apply(await fetchTemplates()), [apply]);

  useEffect(() => {
    let cancelled = false;
    fetchTemplates().then((d) => {
      if (!cancelled) apply(d);
    });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  // Runs an action, then reloads the list. False on error.
  async function run(id: string, action: () => Promise<TemplateResult>): Promise<boolean> {
    setError(null);
    setActing(id);
    const result = await action();
    setActing(null);
    if (result.error) {
      setError(result.error);
      return false;
    }
    await load();
    router.refresh();
    return true;
  }

  async function handleDelete(t: TemplateRow) {
    if (!confirm(`Delete the "${t.name}" template? Emails already sent with it aren't affected.`)) return;
    await run(t.id, () => deleteEmailTemplate(t.id));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500, maxWidth: 560 }}>
          Emails you send families again and again: a practice change, picture day, a fee reminder. When you email
          families from the Directory, a player&apos;s page or the waitlist, pick one from <strong>Template</strong>, then
          change anything before you send.
        </div>
        {!adding && (
          <span data-tour="email-templates-add" style={{ display: "inline-flex" }}>
            <Pill variant="accent" size="sm" onClick={() => { setAdding(true); setEditingId(null); setError(null); }}>
              <Icons.Plus width={14} height={14} /> Add template
            </Pill>
          </span>
        )}
      </div>

      {error && <ErrorBox text={error} />}

      {adding && (
        <TemplateForm
          submitLabel="Add template"
          onCancel={() => { setAdding(false); setError(null); }}
          onSubmit={async (values) => {
            if (await run("new", () => createEmailTemplate(values))) setAdding(false);
          }}
        />
      )}

      {loading ? (
        <div style={{ padding: "40px 0", textAlign: "center", color: "var(--gw-fg-muted)", fontSize: 13 }}>Loading…</div>
      ) : rows.length === 0 ? (
        !adding && (
          <div className="rsd-card" style={{ textAlign: "center", padding: "40px 24px" }}>
            <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>No templates yet.</div>
          </div>
        )
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map((t) =>
            editingId === t.id ? (
              <TemplateForm
                key={t.id}
                initial={t}
                submitLabel="Save"
                onCancel={() => { setEditingId(null); setError(null); }}
                onSubmit={async (values) => {
                  if (await run(t.id, () => updateEmailTemplate(t.id, values))) setEditingId(null);
                }}
              />
            ) : (
              <div
                key={t.id}
                className="rsd-card"
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: 14,
                  padding: "12px 18px",
                  opacity: acting === t.id ? 0.5 : 1,
                  transition: "opacity 150ms",
                }}
              >
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                  <span style={{ fontSize: 14, fontWeight: 800 }}>{t.name}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--gw-fg)" }}>{t.subject}</span>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      color: "var(--gw-fg-muted)",
                      overflow: "hidden",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                    }}
                  >
                    {t.body.replace(/\s+/g, " ")}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--gw-fg-muted)" }}>
                    Updated {new Date(t.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    {t.updated_by_name ? ` by ${t.updated_by_name}` : ""}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <IconBtn onClick={() => { setEditingId(t.id); setAdding(false); setError(null); }} disabled={!!acting} title="Edit">
                    <Icons.Pencil width={14} height={14} />
                  </IconBtn>
                  <IconBtn onClick={() => handleDelete(t)} disabled={!!acting} title="Delete" danger>
                    <Icons.Trash width={14} height={14} />
                  </IconBtn>
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

function TemplateForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: EmailTemplateInput;
  submitLabel: string;
  onSubmit: (values: EmailTemplateInput) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [body, setBody] = useState(initial?.body ?? FAMILY_MESSAGE);
  const [pending, setPending] = useState(false);
  const ready = !!name.trim() && !!subject.trim() && !!body.trim();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ready) return;
    setPending(true);
    await onSubmit({ name, subject, body });
    setPending(false);
  }

  return (
    <form onSubmit={handleSubmit} className="rsd-card" style={{ gap: 14, padding: "16px 18px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        <div data-tour="email-template-name">
          <Input
            label="Name *"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Practice change"
            maxLength={TEMPLATE_NAME_MAX}
            help="What you pick from the Template list. Families don't see it."
            autoFocus
            required
          />
        </div>
        <Input
          label="Subject *"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="e.g. Practice moved this week"
          maxLength={TEMPLATE_SUBJECT_MAX}
          required
        />
      </div>
      <div data-tour="email-template-body">
        <Textarea
          label="Message *"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={10}
          maxLength={TEMPLATE_BODY_MAX}
          help="Type {player} where the player's first name goes. Brothers and sisters get one email, with their names together (Sam and Evan)."
        />
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Pill variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          Cancel
        </Pill>
        <Pill variant="accent" size="sm" type="submit" disabled={pending || !ready}>
          {pending ? "Saving…" : submitLabel}
        </Pill>
      </div>
    </form>
  );
}
