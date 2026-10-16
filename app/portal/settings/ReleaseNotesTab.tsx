"use client";
// Settings → Release Notes: what shipped, grouped by day. The board reads;
// super-admins add, edit and delete. "Show me how" opens a step-by-step
// walkthrough for that item. A released roadmap card can prefill a new note.

import { useCallback, useEffect, useState } from "react";
import { Icons } from "../../components/icons";
import { Input, Pill, Select, Textarea } from "../../components/ui";
import { createClient } from "../../../lib/supabase/client";
import { isSuperAdmin, type MemberLike } from "../../../lib/auth/permissions";
import { deleteReleaseNote, saveReleaseNote, type ReleaseNoteResult } from "../../../lib/release-notes/actions";
import {
  AREAS,
  RELEASE_NOTE_COLUMNS,
  STEPS_MAX,
  STEP_BODY_MAX,
  STEP_TITLE_MAX,
  SUMMARY_MAX,
  TITLE_MAX,
  asReleaseNote,
  draftFromRoadmap,
  emptyForm,
  filterByArea,
  formFromNote,
  formatDay,
  groupByDay,
  type HowStepInput,
  type ReleaseNote,
  type ReleaseNoteInput,
} from "../../../lib/release-notes/model";
import type { RoadmapItem } from "../../../lib/roadmap/model";
import { ErrorBox, IconBtn } from "./TeamsSettingsTab";
import { ReleaseWalkthrough, ShowHowButton } from "./ReleaseWalkthrough";

interface NotesData {
  rows: ReleaseNote[];
  released: RoadmapItem[];
  error: string | null;
}

async function fetchNotes(canEdit: boolean): Promise<NotesData> {
  const supabase = createClient();
  const notesQ = supabase
    .from("olb_release_notes")
    .select(RELEASE_NOTE_COLUMNS)
    .is("deleted_at", null)
    .order("released_on", { ascending: false })
    .order("title", { ascending: true });
  const roadmapQ = canEdit
    ? supabase
        .from("olb_roadmap_items")
        .select("id, title, description, area, status, released_on, preview_url, created_at")
        .eq("status", "released")
        .is("deleted_at", null)
        .order("released_on", { ascending: false })
    : null;
  const [{ data, error }, releasedRes] = await Promise.all([notesQ, roadmapQ ?? Promise.resolve({ data: null, error: null })]);
  if (error) return { rows: [], released: [], error: error.message };
  const rows = ((data as Record<string, unknown>[] | null) ?? []).map(asReleaseNote);
  const released = ((releasedRes.data as RoadmapItem[] | null) ?? []).filter((i) => i.status === "released");
  return { rows, released, error: releasedRes.error?.message ?? null };
}

export function ReleaseNotesTab({ me }: { me: MemberLike }) {
  const canEdit = isSuperAdmin(me);
  const [rows, setRows] = useState<ReleaseNote[]>([]);
  const [released, setReleased] = useState<RoadmapItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [area, setArea] = useState("all");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [how, setHow] = useState<ReleaseNote | null>(null);

  const apply = useCallback((d: NotesData) => {
    if (d.error && d.rows.length === 0) setError(d.error);
    else {
      setRows(d.rows);
      setReleased(d.released);
      if (d.error) setError(d.error);
    }
    setLoading(false);
  }, []);

  const load = useCallback(async () => apply(await fetchNotes(canEdit)), [apply, canEdit]);

  useEffect(() => {
    let cancelled = false;
    fetchNotes(canEdit).then((d) => {
      if (!cancelled) apply(d);
    });
    return () => {
      cancelled = true;
    };
  }, [apply, canEdit]);

  async function run(id: string, action: () => Promise<ReleaseNoteResult>): Promise<boolean> {
    setError(null);
    setActing(id);
    const result = await action();
    setActing(null);
    if (result.error) {
      setError(result.error);
      return false;
    }
    await load();
    return true;
  }

  async function handleDelete(n: ReleaseNote) {
    if (!confirm(`Delete “${n.title}”? The board won’t see it any more.`)) return;
    await run(n.id, () => deleteReleaseNote(n.id));
  }

  const visible = filterByArea(rows, area);
  const groups = groupByDay(visible);
  const areaCount = (a: string) => rows.filter((n) => n.area === a).length;
  const areas = AREAS.filter((a) => areaCount(a) > 0);
  const linked = new Set(rows.map((n) => n.roadmap_item_id).filter((id): id is string => !!id));
  const keepLink = editingId ? rows.find((n) => n.id === editingId)?.roadmap_item_id : null;
  const unusedReleased = released.filter((i) => i.id === keepLink || !linked.has(i.id));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="rsd-release-head">
        <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500, maxWidth: 560 }}>
          What just shipped in the portal, the website, registration, payments, the HS Schedule, and Slack &amp; email.
          Tap{" "}
          <strong data-tour="release-notes-show-how">Show me how</strong>{" "}
          for a step-by-step walkthrough.
        </div>
        {canEdit && !adding && (
          <span data-tour="release-notes-add" style={{ display: "inline-flex" }}>
            <Pill
              variant="accent"
              size="sm"
              onClick={() => {
                setAdding(true);
                setEditingId(null);
                setError(null);
              }}
            >
              <Icons.Plus width={14} height={14} /> Add note
            </Pill>
          </span>
        )}
      </div>

      {error && <ErrorBox text={error} />}

      {adding && (
        <NoteForm
          submitLabel="Add note"
          released={unusedReleased}
          onCancel={() => {
            setAdding(false);
            setError(null);
          }}
          onSubmit={async (values) => {
            if (await run("new", () => saveReleaseNote(null, values))) setAdding(false);
          }}
        />
      )}

      <div data-tour="release-notes-filter" role="group" aria-label="Area" className="rsd-release-chips">
        <Chip on={area === "all"} onClick={() => setArea("all")}>
          All · {rows.length}
        </Chip>
        {(areas.length > 0 ? areas : AREAS).map((a) => (
          <Chip key={a} on={area === a} onClick={() => setArea(area === a ? "all" : a)}>
            {a} · {areaCount(a)}
          </Chip>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: "40px 0", textAlign: "center", color: "var(--gw-fg-muted)", fontSize: 13 }}>Loading…</div>
      ) : rows.length === 0 ? (
        !adding && (
          <div className="rsd-card" data-tour="release-notes-list" style={{ textAlign: "center", padding: "40px 24px" }}>
            <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
              {canEdit ? "No release notes yet. Add the first one." : "No release notes yet."}
            </div>
          </div>
        )
      ) : groups.length === 0 ? (
        <div className="rsd-card" data-tour="release-notes-list" style={{ textAlign: "center", padding: "32px 24px" }}>
          <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>Nothing in that area yet.</div>
        </div>
      ) : (
        <div data-tour="release-notes-list" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {groups.map((g) => (
            <section key={g.day} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <h3 className="rsd-eyebrow" style={{ margin: 0 }}>
                {formatDay(g.day)}
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {g.notes.map((n) =>
                  editingId === n.id ? (
                    <NoteForm
                      key={n.id}
                      initial={formFromNote(n)}
                      submitLabel="Save"
                      released={unusedReleased}
                      onCancel={() => {
                        setEditingId(null);
                        setError(null);
                      }}
                      onSubmit={async (values) => {
                        if (await run(n.id, () => saveReleaseNote(n.id, values))) setEditingId(null);
                      }}
                    />
                  ) : (
                    <article
                      key={n.id}
                      className="rsd-card rsd-release-card"
                      style={{ opacity: acting === n.id ? 0.5 : 1 }}
                    >
                      <div className="rsd-release-card-body">
                        <div className="rsd-release-card-meta">
                          <span className="rsd-chip rsd-chip-mute">{n.area}</span>
                          {n.roadmap_item_id && (
                            <span className="rsd-chip rsd-chip-accent" title="Linked from a released roadmap item">
                              Roadmap
                            </span>
                          )}
                        </div>
                        <h4 className="rsd-release-card-title">{n.title}</h4>
                        <p className="rsd-release-card-summary">{n.summary}</p>
                      </div>
                      <div className="rsd-release-card-actions">
                        <ShowHowButton note={n} onClick={() => setHow(n)} />
                        {canEdit && (
                          <>
                            <IconBtn
                              onClick={() => {
                                setEditingId(n.id);
                                setAdding(false);
                                setError(null);
                              }}
                              disabled={!!acting}
                              title="Edit"
                              size={44}
                            >
                              <Icons.Pencil width={14} height={14} />
                            </IconBtn>
                            <IconBtn onClick={() => handleDelete(n)} disabled={!!acting} title="Delete" danger size={44}>
                              <Icons.Trash width={14} height={14} />
                            </IconBtn>
                          </>
                        )}
                      </div>
                    </article>
                  )
                )}
              </div>
            </section>
          ))}
        </div>
      )}

      {how && <ReleaseWalkthrough note={how} onClose={() => setHow(null)} />}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className="gw-press rsd-tap"
      style={{
        padding: "8px 12px",
        minHeight: 36,
        borderRadius: 100,
        border: "1px solid",
        borderColor: on ? "var(--rsd-accent-fill)" : "var(--gw-border)",
        background: on ? "var(--rsd-accent-fill)" : "var(--gw-bg-elev)",
        color: on ? "var(--rsd-accent-fill-on)" : "var(--gw-fg)",
        fontSize: 12,
        fontWeight: 700,
        whiteSpace: "nowrap",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function NoteForm({
  initial,
  submitLabel,
  released,
  onSubmit,
  onCancel,
}: {
  initial?: ReleaseNoteInput;
  submitLabel: string;
  released: RoadmapItem[];
  onSubmit: (values: ReleaseNoteInput) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<ReleaseNoteInput>(initial ?? emptyForm());
  const [pending, setPending] = useState(false);
  const ready = !!form.title.trim() && !!form.summary.trim() && !!form.releasedOn.trim();

  function patch(p: Partial<ReleaseNoteInput>) {
    setForm((f) => ({ ...f, ...p }));
  }

  function fromRoadmap(id: string) {
    if (!id) {
      patch({ roadmapItemId: null });
      return;
    }
    const item = released.find((r) => r.id === id);
    if (!item) return;
    const draft = draftFromRoadmap(item);
    if ("error" in draft) return;
    setForm({
      ...form,
      ...draft,
      steps: form.steps,
      mediaUrl: form.mediaUrl,
      href: form.href || "/portal",
    });
  }

  function setStep(i: number, p: Partial<HowStepInput>) {
    setForm((f) => ({
      ...f,
      steps: f.steps.map((s, n) => (n === i ? { ...s, ...p } : s)),
    }));
  }

  function moveStep(i: number, dir: -1 | 1) {
    setForm((f) => {
      const j = i + dir;
      if (j < 0 || j >= f.steps.length) return f;
      const steps = [...f.steps];
      const tmp = steps[i];
      steps[i] = steps[j];
      steps[j] = tmp;
      return { ...f, steps };
    });
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ready) return;
    setPending(true);
    await onSubmit(form);
    setPending(false);
  }

  return (
    <form onSubmit={handleSubmit} className="rsd-card" style={{ gap: 14, padding: "16px 18px" }}>
      {released.length > 0 && (
        <Select
          label="From a released roadmap item"
          help="Copies the title, area, summary and live date. You can still add a Show me how walkthrough."
          value={form.roadmapItemId ?? ""}
          onChange={(e) => fromRoadmap(e.target.value)}
        >
          <option value="">New note, not from the roadmap</option>
          {released.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title}
              {r.released_on ? ` · ${formatDay(r.released_on)}` : ""}
            </option>
          ))}
        </Select>
      )}

      <div className="rsd-release-form-grid">
        <Input
          label="Title *"
          value={form.title}
          onChange={(e) => patch({ title: e.target.value })}
          maxLength={TITLE_MAX}
          placeholder="e.g. Staying elsewhere on hotel stays"
          autoFocus
          required
        />
        <Select label="Area *" value={form.area} onChange={(e) => patch({ area: e.target.value })}>
          {AREAS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </Select>
        <Input
          label="Released *"
          type="date"
          value={form.releasedOn}
          onChange={(e) => patch({ releasedOn: e.target.value })}
          required
        />
      </div>

      <Textarea
        label="Summary *"
        value={form.summary}
        onChange={(e) => patch({ summary: e.target.value })}
        rows={4}
        maxLength={SUMMARY_MAX}
        help="A few sentences for the board. What changed, and who it helps."
      />

      <div className="rsd-release-form-grid">
        <Input
          label="Page to open"
          value={form.href ?? ""}
          onChange={(e) => patch({ href: e.target.value })}
          placeholder="/portal/directory"
          help="Optional. A portal path or a web address. The first walkthrough step can use it as “Go there”."
        />
        <Input
          label="Screenshot or video"
          value={form.mediaUrl ?? ""}
          onChange={(e) => patch({ mediaUrl: e.target.value })}
          placeholder="https://…"
          help="Optional. A picture, a video file, or a YouTube / Vimeo link shown in Show me how."
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="rsd-eyebrow">Show me how</div>
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
          Ordered steps the board taps through. Leave this empty if a summary is enough.
        </p>
        {form.steps.map((s, i) => (
          <div key={i} className="rsd-release-step">
            <div className="rsd-release-step-head">
              <span className="rsd-eyebrow">Step {i + 1}</span>
              <div style={{ display: "flex", gap: 6 }}>
                <IconBtn onClick={() => moveStep(i, -1)} title="Move up" disabled={i === 0} size={36}>
                  <Icons.ChevronUp width={14} height={14} />
                </IconBtn>
                <IconBtn onClick={() => moveStep(i, 1)} title="Move down" disabled={i === form.steps.length - 1} size={36}>
                  <Icons.ChevronDown width={14} height={14} />
                </IconBtn>
                <IconBtn
                  onClick={() => patch({ steps: form.steps.filter((_, n) => n !== i) })}
                  title="Remove step"
                  danger
                  size={36}
                >
                  <Icons.Trash width={14} height={14} />
                </IconBtn>
              </div>
            </div>
            <Input
              label="Title *"
              value={s.title}
              onChange={(e) => setStep(i, { title: e.target.value })}
              maxLength={STEP_TITLE_MAX}
              placeholder="e.g. Open the Directory"
            />
            <Textarea
              label="What to do *"
              value={s.body}
              onChange={(e) => setStep(i, { body: e.target.value })}
              rows={3}
              maxLength={STEP_BODY_MAX}
            />
            <div className="rsd-release-form-grid">
              <Input
                label="Page to open"
                value={s.href ?? ""}
                onChange={(e) => setStep(i, { href: e.target.value })}
                placeholder="/portal/directory"
              />
              <Input
                label="Screenshot or video"
                value={s.mediaUrl ?? ""}
                onChange={(e) => setStep(i, { mediaUrl: e.target.value })}
                placeholder="https://…"
              />
            </div>
          </div>
        ))}
        {form.steps.length < STEPS_MAX && (
          <Pill
            variant="ghost"
            size="sm"
            onClick={() => patch({ steps: [...form.steps, { title: "", body: "", mediaUrl: "", href: "" }] })}
          >
            <Icons.Plus width={14} height={14} /> Add step
          </Pill>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
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
