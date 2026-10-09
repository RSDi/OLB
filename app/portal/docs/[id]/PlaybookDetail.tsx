"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Icons } from "../../../components/icons";
import { MarkdownEditor } from "../../../components/MarkdownEditor";
import { MarkdownView } from "../../../components/MarkdownView";
import { softDeletePlaybook, updatePlaybook } from "../../../../lib/playbooks/actions";
import {
  createProcedure,
  updateProcedure,
  deleteProcedure,
  type ProcedureInput,
} from "../../../../lib/playbooks/procedures-actions";
import type { PlaybookProcedure, ProcedureRun } from "../../../../lib/playbooks/procedures-data";
import { ProcedureRunner } from "../../../components/ProcedureRunner";
import {
  LinkedContacts,
  type LinkedContactRow,
  type PickerOption,
} from "../../contacts/_shared/LinkedContacts";
import { ComboSelect } from "../../../components/ComboSelect";

export interface PlaybookDetailData {
  id: string;
  title: string;
  excerpt: string | null;
  body_md: string;
  updated_at: string;
  created_at: string;
  category: { id: string; name: string; chip_class: string } | null;
  updated_by_name: string | null;
  created_by_name: string | null;
  version_count: number;
  // Procedures (0066): a playbook owns many runnable checklists, each with its
  // own notify config + run history (runsByProcedure keyed by procedure id).
  procedures: PlaybookProcedure[];
  runsByProcedure: Record<string, ProcedureRun[]>;
}

interface Props {
  data: PlaybookDetailData;
  canEdit: boolean;
  canDelete: boolean;
  categories: { id: string; name: string; chip_class: string }[];
  // Contact linkage — staff-only. Server omits these for non-staff viewers
  // so the widget never renders.
  contactLinks?: LinkedContactRow[];
  contactPickerOptions?: PickerOption[];
}

type Mode = "view" | "edit";

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

export function PlaybookDetail({
  data,
  canEdit,
  canDelete,
  categories,
  contactLinks,
  contactPickerOptions,
}: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("view");
  const [title, setTitle] = useState(data.title);
  const [categoryId, setCategoryId] = useState<string | null>(data.category?.id ?? null);
  const [excerpt, setExcerpt] = useState(data.excerpt ?? "");
  const [bodyMd, setBodyMd] = useState(data.body_md);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const chip = data.category?.chip_class ?? "rsd-chip-mute";

  function enterEdit() {
    setTitle(data.title);
    setCategoryId(data.category?.id ?? null);
    setExcerpt(data.excerpt ?? "");
    setBodyMd(data.body_md);
    setError(null);
    setMode("edit");
  }

  function cancelEdit() {
    setMode("view");
    setError(null);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await updatePlaybook(data.id, {
        title,
        categoryId,
        excerpt: excerpt.trim() || null,
        bodyMd,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setMode("view");
      router.refresh();
    });
  }

  function confirmDelete() {
    if (!window.confirm(`Delete "${data.title}"? It can be restored from Settings → Deleted.`)) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await softDeletePlaybook(data.id);
      if (res.error) {
        setError(res.error);
        return;
      }
      router.push("/portal/docs");
    });
  }

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="rsd-eyebrow" style={{ marginBottom: 6 }}>
            <Link
              href="/portal/docs"
              style={{ color: "inherit", textDecoration: "none" }}
            >
              ← Playbooks
            </Link>
          </div>
          {mode === "view" ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h2
                style={{
                  margin: 0,
                  fontSize: 24,
                  fontWeight: 800,
                  letterSpacing: "-.02em",
                  lineHeight: 1.2,
                }}
              >
                {data.title}
              </h2>
              {data.category && (
                <span className={`rsd-chip ${chip}`}>{data.category.name}</span>
              )}
            </div>
          ) : (
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Playbook title"
              autoFocus
              style={{
                width: "100%",
                fontSize: 24,
                fontWeight: 800,
                letterSpacing: "-.02em",
                lineHeight: 1.2,
                color: "var(--gw-fg)",
                background: "transparent",
                border: "none",
                borderBottom: "1px solid var(--gw-border)",
                padding: "4px 0",
                outline: "none",
              }}
            />
          )}
          <div
            style={{
              fontSize: 12,
              color: "var(--gw-fg-muted)",
              fontWeight: 500,
              marginTop: 8,
            }}
          >
            Updated {formatDateTime(data.updated_at)} ·{" "}
            {authorLabel(data.updated_by_name)}
            {canEdit && data.version_count > 0 && (
              <>
                {" · "}
                <Link
                  href={`/portal/docs/${data.id}/history`}
                  className="rsd-link"
                >
                  {data.version_count} version{data.version_count === 1 ? "" : "s"}
                </Link>
              </>
            )}
          </div>
        </div>

        {canEdit && mode === "view" && (
          <div style={{ display: "flex", gap: 8 }}>
            <Link
              href={`/portal/docs/${data.id}/history`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                borderRadius: 100,
                background: "var(--gw-bg-elev)",
                color: "var(--gw-fg)",
                border: "1px solid var(--gw-border)",
                fontSize: 12,
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              <Icons.Clock width={12} height={12} />
              History
            </Link>
            <button
              type="button"
              onClick={enterEdit}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                borderRadius: 100,
                background: "var(--rsd-accent-fill)",
                color: "var(--rsd-accent-fill-on)",
                border: "none",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              <Icons.Pencil width={12} height={12} />
              Edit
            </button>
          </div>
        )}

        {canEdit && mode === "edit" && (
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={cancelEdit}
              disabled={pending}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                borderRadius: 100,
                background: "var(--gw-bg-elev)",
                color: "var(--gw-fg)",
                border: "1px solid var(--gw-border)",
                fontSize: 12,
                fontWeight: 700,
                cursor: pending ? "not-allowed" : "pointer",
                opacity: pending ? 0.6 : 1,
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={pending || !title.trim()}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                borderRadius: 100,
                background: "var(--rsd-accent-fill)",
                color: "var(--rsd-accent-fill-on)",
                border: "none",
                fontSize: 12,
                fontWeight: 700,
                cursor: pending || !title.trim() ? "not-allowed" : "pointer",
                opacity: pending || !title.trim() ? 0.6 : 1,
              }}
            >
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        )}
      </div>

      {mode === "edit" && (
        <div
          style={{
            marginTop: 16,
            display: "flex",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <label style={{ fontSize: 12, fontWeight: 700, color: "var(--gw-fg-muted)" }}>
            Category
            <ComboSelect
              value={categoryId ?? ""}
              onChange={(e) => setCategoryId(e.target.value || null)}
              style={{
                marginLeft: 8,
                padding: "6px 10px",
                borderRadius: 8,
                background: "var(--gw-bg-elev)",
                color: "var(--gw-fg)",
                border: "1px solid var(--gw-border)",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              <option value="">— None —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </ComboSelect>
          </label>
        </div>
      )}

      {mode === "view" && data.excerpt && (
        <p
          style={{
            margin: "20px 0 0",
            fontSize: 14,
            lineHeight: 1.65,
            color: "var(--gw-fg-muted)",
            fontWeight: 500,
            fontStyle: "italic",
          }}
        >
          {data.excerpt}
        </p>
      )}

      {/* Procedures (0066): each runnable checklist, with its own notify
          setting and run history. Managed independently of the doc edit mode. */}
      {mode === "view" && (
        <ProceduresSection
          playbookId={data.id}
          procedures={data.procedures}
          runsByProcedure={data.runsByProcedure}
          canEdit={canEdit}
        />
      )}

      {mode === "edit" && (
        <textarea
          value={excerpt}
          onChange={(e) => setExcerpt(e.target.value)}
          placeholder="Optional short description (shown on the listing card)"
          rows={2}
          style={{
            width: "100%",
            marginTop: 20,
            padding: "10px 14px",
            background: "var(--gw-bg-elev)",
            color: "var(--gw-fg)",
            border: "1px solid var(--gw-border)",
            borderRadius: 8,
            fontSize: 14,
            fontFamily: "inherit",
            lineHeight: 1.5,
            resize: "vertical",
            outline: "none",
          }}
        />
      )}

      {mode === "edit" ? (
        <div style={{ marginTop: 16 }}>
          <MarkdownEditor
            value={bodyMd}
            onChange={setBodyMd}
            placeholder="Write the playbook in Markdown — headings (#), lists (-), links, code blocks, tables. Use the toolbar for inline formatting."
          />
          <div style={{ marginTop: 12, fontSize: 12, color: "var(--gw-fg-muted)", lineHeight: 1.5 }}>
            Runnable procedures (e.g. Startup, Shutdown) are managed below the doc — save this, then add or edit procedures.
          </div>
        </div>
      ) : (
        <article
          className="rsd-markdown"
          style={{
            marginTop: 24,
            padding: "24px 28px",
            background: "var(--gw-bg-elev)",
            border: "1px solid var(--gw-border)",
            borderRadius: 12,
            fontSize: 14,
            lineHeight: 1.7,
            color: "var(--gw-fg)",
          }}
        >
          {data.body_md.trim() ? (
            <MarkdownView>{data.body_md}</MarkdownView>
          ) : (
            <p style={{ margin: 0, color: "var(--gw-fg-muted)", fontStyle: "italic" }}>
              This playbook has no content yet.
            </p>
          )}
        </article>
      )}

      {mode === "view" && contactLinks && contactPickerOptions && (
        <div style={{ marginTop: 20 }}>
          <LinkedContacts
            entityType="playbook"
            entityId={data.id}
            links={contactLinks}
            allContacts={contactPickerOptions}
            canEdit={canEdit}
          />
        </div>
      )}

      {error && (
        <div
          style={{
            marginTop: 16,
            padding: "10px 14px",
            background: "var(--gw-error-bg)",
            color: "var(--gw-error)",
            border: "1px solid var(--gw-error)",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {error}
        </div>
      )}

      {canDelete && mode === "view" && (
        <div
          style={{
            marginTop: 32,
            paddingTop: 20,
            borderTop: "1px solid var(--gw-border)",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <button
            type="button"
            onClick={confirmDelete}
            disabled={pending}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              borderRadius: 100,
              background: "transparent",
              color: "var(--gw-error)",
              border: "1px solid var(--gw-error)",
              fontSize: 12,
              fontWeight: 700,
              cursor: pending ? "not-allowed" : "pointer",
              opacity: pending ? 0.6 : 1,
            }}
          >
            <Icons.Trash width={12} height={12} />
            Delete playbook
          </button>
        </div>
      )}
    </>
  );
}

// ─── Procedures (0066) ───────────────────────────────────────────────
// A playbook's runnable checklists. Each can notify a Slack channel on
// completion or just be logged, and keeps a run history.

function ProceduresSection({
  playbookId,
  procedures,
  runsByProcedure,
  canEdit,
}: {
  playbookId: string;
  procedures: PlaybookProcedure[];
  runsByProcedure: Record<string, ProcedureRun[]>;
  canEdit: boolean;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "var(--gw-fg)" }}>
          Procedures{procedures.length > 0 ? ` (${procedures.length})` : ""}
        </h3>
        {canEdit && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="gw-press"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 13px", borderRadius: 100, background: "var(--rsd-accent-fill)", color: "var(--rsd-accent-fill-on)", border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
          >
            <Icons.Plus width={12} height={12} /> Add procedure
          </button>
        )}
      </div>

      {procedures.length === 0 && !adding && (
        <div style={{ padding: 16, borderRadius: 12, border: "1px dashed var(--gw-border)", fontSize: 13, color: "var(--gw-fg-muted)", textAlign: "center" }}>
          {canEdit
            ? "No procedures yet. Add one to turn this playbook into a runnable checklist (e.g. Startup, Shutdown)."
            : "No runnable procedures on this playbook."}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {procedures.map((p) => (
          <ProcedureCard
            key={p.id}
            playbookId={playbookId}
            procedure={p}
            runs={runsByProcedure[p.id] ?? []}
            canEdit={canEdit}
          />
        ))}
      </div>

      {canEdit && adding && (
        <div style={{ marginTop: 12 }}>
          <ProcedureEditor playbookId={playbookId} onDone={() => setAdding(false)} />
        </div>
      )}
    </div>
  );
}

function ProcedureCard({
  playbookId,
  procedure,
  runs,
  canEdit,
}: {
  playbookId: string;
  procedure: PlaybookProcedure;
  runs: ProcedureRun[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<"run" | "history">("run");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const stepLabels = procedure.steps.map((s) => s.label).filter(Boolean);

  function confirmDelete() {
    if (!window.confirm(`Delete the "${procedure.title}" procedure? Its run history goes with it.`)) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteProcedure(procedure.id, playbookId);
      if (res.error) { setError(res.error); return; }
      router.refresh();
    });
  }

  if (editing) {
    return (
      <ProcedureEditor
        playbookId={playbookId}
        procedure={procedure}
        onDone={() => setEditing(false)}
      />
    );
  }

  return (
    <div style={{ padding: 16, borderRadius: 12, border: "1px solid var(--gw-border)", background: "var(--gw-bg-elev)", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: "var(--gw-fg)" }}>{procedure.title}</span>
          <span className="rsd-chip rsd-chip-mute" style={{ fontSize: 10 }}>{stepLabels.length} steps</span>
          {procedure.notify && procedure.slack_channel ? (
            <span className="rsd-chip rsd-chip-mute" style={{ fontSize: 10 }}>Notifies Slack</span>
          ) : (
            <span className="rsd-chip rsd-chip-mute" style={{ fontSize: 10 }}>Log only</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {/* Run / History tabs */}
          <div style={{ display: "inline-flex", gap: 2, background: "var(--gw-bg)", borderRadius: 8, padding: 3 }}>
            {(["run", "history"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className="gw-press"
                style={{ padding: "4px 10px", borderRadius: 6, border: "none", background: tab === t ? "var(--gw-bg-elev)" : "transparent", color: tab === t ? "var(--gw-fg)" : "var(--gw-fg-muted)", fontSize: 11, fontWeight: 700, cursor: "pointer", boxShadow: tab === t ? "var(--gw-shadow-1)" : "none" }}
              >
                {t === "run" ? "Run" : `History${runs.length ? ` (${runs.length})` : ""}`}
              </button>
            ))}
          </div>
          {canEdit && (
            <>
              <button type="button" onClick={() => setEditing(true)} title="Edit procedure" className="gw-press" style={{ display: "inline-flex", width: 28, height: 28, alignItems: "center", justifyContent: "center", borderRadius: 100, background: "var(--gw-bg)", color: "var(--gw-fg-muted)", border: "1px solid var(--gw-border)", cursor: "pointer" }}>
                <Icons.Pencil width={12} height={12} />
              </button>
              <button type="button" onClick={confirmDelete} disabled={pending} title="Delete procedure" className="gw-press" style={{ display: "inline-flex", width: 28, height: 28, alignItems: "center", justifyContent: "center", borderRadius: 100, background: "transparent", color: "var(--gw-error)", border: "1px solid var(--gw-error)", cursor: pending ? "not-allowed" : "pointer" }}>
                <Icons.Trash width={12} height={12} />
              </button>
            </>
          )}
        </div>
      </div>

      {error && <div style={{ fontSize: 12, color: "var(--gw-error)", fontWeight: 600 }}>{error}</div>}

      {tab === "run" ? (
        stepLabels.length > 0 ? (
          <ProcedureRunner
            procedureId={procedure.id}
            title={procedure.title}
            steps={stepLabels}
            willNotify={procedure.notify && !!procedure.slack_channel}
          />
        ) : (
          <div style={{ fontSize: 13, color: "var(--gw-fg-muted)" }}>No steps yet — edit this procedure to add them.</div>
        )
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {runs.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--gw-fg-muted)" }}>Not run yet.</div>
          ) : (
            runs.map((r) => (
              <div key={r.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, fontSize: 13, padding: "6px 0", borderBottom: "1px solid var(--gw-border)" }}>
                <span style={{ fontWeight: 600, color: "var(--gw-fg)" }}>{r.ran_by_name ?? "A team member"}</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--gw-fg-muted)", fontWeight: 500, whiteSpace: "nowrap" }}>
                  {r.notified && <span className="rsd-chip rsd-chip-mute" style={{ fontSize: 10 }}>notified</span>}
                  {formatDateTime(r.ran_at)}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function ProcedureEditor({
  playbookId,
  procedure,
  onDone,
}: {
  playbookId: string;
  procedure?: PlaybookProcedure;
  onDone: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(procedure?.title ?? "");
  const [stepsText, setStepsText] = useState((procedure?.steps ?? []).map((s) => s.label).join("\n"));
  const [notify, setNotify] = useState(procedure?.notify ?? false);
  const [slackChannel, setSlackChannel] = useState(procedure?.slack_channel ?? "");
  const [completionMessage, setCompletionMessage] = useState(procedure?.completion_message ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    const input: ProcedureInput = {
      title: title.trim() || "Procedure",
      steps: stepsText.split("\n").map((s) => s.trim()).filter(Boolean),
      notify,
      slackChannel: slackChannel.trim() || null,
      completionMessage: completionMessage.trim() || null,
    };
    startTransition(async () => {
      const res = procedure
        ? await updateProcedure(procedure.id, playbookId, input)
        : await createProcedure(playbookId, input);
      if (res.error) { setError(res.error); return; }
      onDone();
      router.refresh();
    });
  }

  const fieldStyle = { padding: "9px 12px", borderRadius: 8, border: "1px solid var(--gw-border)", background: "var(--gw-bg)", color: "var(--gw-fg)", fontSize: 13.5 } as const;
  const labelStyle = { fontSize: 12, fontWeight: 700, color: "var(--gw-fg-muted)" } as const;

  return (
    <div style={{ padding: 16, borderRadius: 12, border: "1px solid var(--rsd-accent)", background: "var(--gw-bg-elev)", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: "var(--gw-fg)" }}>
        {procedure ? "Edit procedure" : "New procedure"}
      </div>
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={labelStyle}>Name</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Gym close-up (after practice)" autoFocus style={fieldStyle} />
      </label>
      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={labelStyle}>Steps — one per line</span>
        <textarea
          value={stepsText}
          onChange={(e) => setStepsText(e.target.value)}
          rows={6}
          placeholder={"Rack the balls and put away the carts\nPick up water bottles and trash\nShut off all the lights\nLock & check the gym doors"}
          style={{ ...fieldStyle, lineHeight: 1.6, resize: "vertical", fontFamily: "inherit" }}
        />
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: "var(--gw-fg)" }}>
        <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} style={{ width: 16, height: 16 }} />
        Notify a Slack channel when this is completed
      </label>
      {notify && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <label style={{ flex: 1, minWidth: 180, display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={labelStyle}>Slack channel</span>
            <input value={slackChannel} onChange={(e) => setSlackChannel(e.target.value)} placeholder="Channel ID, e.g. C04D7F1G6JX" style={fieldStyle} />
          </label>
          <label style={{ flex: 1, minWidth: 180, display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={labelStyle}>Completion message</span>
            <input value={completionMessage} onChange={(e) => setCompletionMessage(e.target.value)} placeholder="✅ Done by {person}." style={fieldStyle} />
          </label>
        </div>
      )}
      <div style={{ fontSize: 11.5, color: "var(--gw-fg-muted)", lineHeight: 1.5 }}>
        Completion is always logged to this procedure&apos;s history. With notify off it&apos;s just logged — no Slack. Use <code>{"{person}"}</code>{" "}for the runner&apos;s name; the bot must be invited to the channel.
      </div>
      {error && <div style={{ fontSize: 12, color: "var(--gw-error)", fontWeight: 600 }}>{error}</div>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button type="button" onClick={onDone} disabled={pending} className="gw-press" style={{ padding: "8px 14px", borderRadius: 100, background: "var(--gw-bg)", color: "var(--gw-fg)", border: "1px solid var(--gw-border)", fontSize: 12, fontWeight: 700, cursor: pending ? "not-allowed" : "pointer" }}>
          Cancel
        </button>
        <button type="button" onClick={save} disabled={pending} className="gw-press" style={{ padding: "8px 14px", borderRadius: 100, background: "var(--rsd-accent-fill)", color: "var(--rsd-accent-fill-on)", border: "none", fontSize: 12, fontWeight: 700, cursor: pending ? "not-allowed" : "pointer" }}>
          {pending ? "Saving…" : procedure ? "Save procedure" : "Add procedure"}
        </button>
      </div>
    </div>
  );
}
