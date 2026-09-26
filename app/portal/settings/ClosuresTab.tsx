"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Icons } from "../../components/icons";
import { Input, Pill, Select } from "../../components/ui";
import { MarkdownEditor } from "../../components/MarkdownEditor";
import { createClient } from "../../../lib/supabase/client";
import { churchToday, formatShortDate } from "../../../lib/dates/today";
import {
  clearClosure,
  createClosureReason,
  softDeleteClosureReason,
  startClosure,
  updateClosure,
  updateClosureReason,
  type ClosureInput,
} from "../../../lib/closures/actions";
import { isSuperAdmin, type MemberLike } from "../../../lib/auth/permissions";

interface Closure {
  id: string;
  title: string;
  body_md: string;
  reason_id: string | null;
  starts_on: string;
  ends_on: string | null;
}

interface ClosureReason {
  id: string;
  title: string;
  body_md: string;
  sort_order: number;
}

// The open closure's standing relative to the church-local day. "scheduled"
// and "expired" rows are still the single open closure — they just don't
// render on /meeting-times yet/anymore.
function closureStatus(c: Closure, today: string): "active" | "scheduled" | "expired" {
  if (c.starts_on > today) return "scheduled";
  if (c.ends_on && c.ends_on < today) return "expired";
  return "active";
}

export function ClosuresTab({ me }: { me: MemberLike }) {
  const [open, setOpen] = useState<Closure | null>(null);
  const [reasons, setReasons] = useState<ClosureReason[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingClosure, setEditingClosure] = useState(false);
  const [addingReason, setAddingReason] = useState(false);
  const [editingReasonId, setEditingReasonId] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canDelete = isSuperAdmin(me);
  const today = churchToday();

  const load = useCallback(async () => {
    const supabase = createClient();
    const [{ data: openRow, error: openErr }, { data: reasonRows, error: reasonErr }] =
      await Promise.all([
        supabase
          .from("closures")
          .select("id, title, body_md, reason_id, starts_on, ends_on")
          .is("cleared_at", null)
          .is("deleted_at", null)
          .maybeSingle(),
        supabase
          .from("closure_reasons")
          .select("id, title, body_md, sort_order")
          .is("deleted_at", null)
          .order("sort_order")
          .order("title"),
      ]);
    if (openErr) setError(openErr.message);
    else setOpen((openRow as Closure | null) ?? null);
    if (reasonErr) setError(reasonErr.message);
    else setReasons((reasonRows as ClosureReason[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSaveClosure(input: ClosureInput) {
    setError(null);
    const res = open ? await updateClosure(open.id, input) : await startClosure(input);
    if (res.error) {
      setError(res.error);
      return;
    }
    setEditingClosure(false);
    await load();
  }

  async function handleClear() {
    if (!open) return;
    if (!confirm("Mark the church as meeting again? The Meeting Times page will switch back to the regular schedule.")) {
      return;
    }
    setError(null);
    setActing(open.id);
    const res = await clearClosure(open.id);
    if (res.error) setError(res.error);
    else {
      setEditingClosure(false);
      await load();
    }
    setActing(null);
  }

  async function handleAddReason(values: ReasonFormValues) {
    setError(null);
    const res = await createClosureReason(values);
    if (res.error) {
      setError(res.error);
      return;
    }
    setAddingReason(false);
    await load();
  }

  async function handleUpdateReason(id: string, values: ReasonFormValues) {
    setError(null);
    setActing(id);
    const res = await updateClosureReason(id, values);
    if (res.error) {
      setError(res.error);
      setActing(null);
      return;
    }
    setEditingReasonId(null);
    await load();
    setActing(null);
  }

  async function handleDeleteReason(id: string, title: string) {
    if (!confirm(`Delete the "${title}" template? Past and current closures keep their content.`)) {
      return;
    }
    setError(null);
    setActing(id);
    const res = await softDeleteClosureReason(id);
    if (res.error) setError(res.error);
    else await load();
    setActing(null);
  }

  if (loading) {
    return (
      <div style={{ padding: "40px 0", textAlign: "center", color: "var(--gw-fg-muted)", fontSize: 13 }}>
        Loading…
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      {error && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "var(--gw-error-bg)",
            border: "1px solid rgba(229,62,62,.25)",
            borderRadius: 10,
            padding: "12px 16px",
            fontSize: 13,
            color: "var(--gw-error)",
            fontWeight: 600,
          }}
        >
          <Icons.AlertCircle width={16} height={16} />
          {error}
        </div>
      )}

      {/* ----- Current status ----- */}
      <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Meeting status</h3>
          <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500, marginTop: 4 }}>
            Controls the public Meeting Times page behind the door sign&rsquo;s QR code.
          </div>
        </div>

        {editingClosure ? (
          <ClosureForm
            initial={open}
            reasons={reasons}
            today={today}
            submitLabel={open ? "Save changes" : "Start closure"}
            onCancel={() => {
              setEditingClosure(false);
              setError(null);
            }}
            onSubmit={handleSaveClosure}
          />
        ) : open ? (
          <OpenClosureCard
            closure={open}
            status={closureStatus(open, today)}
            acting={acting === open.id}
            onEdit={() => {
              setEditingClosure(true);
              setError(null);
            }}
            onClear={handleClear}
          />
        ) : (
          <div className="rsd-card" style={{
            flexDirection: "row", alignItems: "center", gap: 14, padding: "18px 20px",
            background: "var(--rsd-accent-bg)", border: "1px solid var(--rsd-accent-line)",
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: "var(--rsd-accent)" }}>
                We&rsquo;re meeting as normal
              </div>
              <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 500, marginTop: 4 }}>
                The public Meeting Times page shows the regular schedule.
              </div>
            </div>
            <Pill variant="accent" size="sm" onClick={() => { setEditingClosure(true); setError(null); }}>
              <Icons.Plus width={14} height={14} /> Start a closure
            </Pill>
          </div>
        )}
      </section>

      {/* ----- Door sign ----- */}
      <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Door sign</h3>
          <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500, marginTop: 4 }}>
            The printable sign&rsquo;s QR code is permanent — print it once and reuse it for every closure.
          </div>
        </div>
        <div className="rsd-card" style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: "14px 20px", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200, fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
            One page, letter size: &ldquo;We&rsquo;re not meeting today — scan for more information.&rdquo;
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link href="/meeting-times" target="_blank" style={{ textDecoration: "none" }}>
              <Pill variant="ghost" size="sm">View live page</Pill>
            </Link>
            <Link href="/door-sign" target="_blank" style={{ textDecoration: "none" }}>
              <Pill variant="accent" size="sm">
                <Icons.ArrowRight width={13} height={13} /> Print the door sign
              </Pill>
            </Link>
          </div>
        </div>
      </section>

      {/* ----- Reason templates ----- */}
      <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Reason templates</h3>
            <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500, marginTop: 4 }}>
              Prefill for recurring closures — picking one copies its content into the closure, so edits here never change a notice already on the door.
            </div>
          </div>
          {!addingReason && (
            <Pill variant="accent" size="sm" onClick={() => setAddingReason(true)}>
              <Icons.Plus width={14} height={14} /> Add template
            </Pill>
          )}
        </div>

        {addingReason && (
          <ReasonForm
            submitLabel="Add template"
            onCancel={() => {
              setAddingReason(false);
              setError(null);
            }}
            onSubmit={handleAddReason}
          />
        )}

        {reasons.length === 0 ? (
          <div className="rsd-card" style={{ textAlign: "center", padding: "40px 24px" }}>
            <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
              No templates yet.
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {reasons.map((r) =>
              editingReasonId === r.id ? (
                <ReasonForm
                  key={r.id}
                  initial={{ title: r.title, bodyMd: r.body_md, sortOrder: r.sort_order }}
                  submitLabel="Save"
                  onCancel={() => {
                    setEditingReasonId(null);
                    setError(null);
                  }}
                  onSubmit={(values) => handleUpdateReason(r.id, values)}
                />
              ) : (
                <div
                  key={r.id}
                  className="rsd-card"
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 14,
                    padding: "12px 18px",
                    opacity: acting === r.id ? 0.5 : 1,
                    transition: "opacity 150ms",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "var(--gw-fg)" }}>{r.title}</div>
                    <div style={{
                      fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 500, marginTop: 2,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {r.body_md || "No content yet"}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    <IconBtn onClick={() => { setEditingReasonId(r.id); setError(null); }} disabled={acting === r.id} title="Edit">
                      <Icons.Pencil width={14} height={14} />
                    </IconBtn>
                    {canDelete && (
                      <IconBtn onClick={() => handleDeleteReason(r.id, r.title)} disabled={acting === r.id} title="Delete" danger>
                        <Icons.Trash width={14} height={14} />
                      </IconBtn>
                    )}
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function OpenClosureCard({
  closure,
  status,
  acting,
  onEdit,
  onClear,
}: {
  closure: Closure;
  status: "active" | "scheduled" | "expired";
  acting: boolean;
  onEdit: () => void;
  onClear: () => void;
}) {
  const dates = closure.ends_on
    ? closure.starts_on === closure.ends_on
      ? formatShortDate(closure.starts_on)
      : `${formatShortDate(closure.starts_on)} – ${formatShortDate(closure.ends_on)}`
    : `from ${formatShortDate(closure.starts_on)}`;
  const note =
    status === "scheduled"
      ? `Scheduled — the public page switches over on ${formatShortDate(closure.starts_on)}.`
      : status === "expired"
      ? "Ended — the Meeting Times page is already back to the regular schedule. Clear it to tidy up."
      : closure.ends_on
      ? `Live on the public page. Auto-expires after ${formatShortDate(closure.ends_on)}.`
      : "Live on the public page until cleared manually.";

  return (
    <div className="rsd-card" style={{
      gap: 12, padding: "18px 20px",
      background: status === "active" ? "var(--gw-error-bg)" : "var(--gw-bg-elev)",
      border: `1px solid ${status === "active" ? "rgba(229,62,62,.25)" : "var(--gw-border)"}`,
      opacity: acting ? 0.5 : 1,
      transition: "opacity 150ms",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: status === "active" ? "var(--gw-error)" : "var(--gw-fg)" }}>
            Not meeting — {closure.title}
          </div>
          <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 500, marginTop: 4 }}>
            {dates} · {note}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Pill variant="ghost" size="sm" onClick={onEdit} disabled={acting}>
            <Icons.Pencil width={13} height={13} /> Edit
          </Pill>
          <Pill variant="accent" size="sm" onClick={onClear} disabled={acting}>
            We&rsquo;re meeting again
          </Pill>
        </div>
      </div>
    </div>
  );
}

function ClosureForm({
  initial,
  reasons,
  today,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: Closure | null;
  reasons: ClosureReason[];
  today: string;
  submitLabel: string;
  onSubmit: (input: ClosureInput) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [reasonId, setReasonId] = useState<string>(initial?.reason_id ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [bodyMd, setBodyMd] = useState(initial?.body_md ?? "");
  const [startsOn, setStartsOn] = useState(initial?.starts_on ?? today);
  const [endsOn, setEndsOn] = useState(initial?.ends_on ?? today);
  const [pending, setPending] = useState(false);

  // Picking a template copies its content in (copy, not reference — later
  // template edits must not rewrite a closure already announced).
  function handlePickReason(id: string) {
    setReasonId(id);
    const reason = reasons.find((r) => r.id === id);
    if (reason) {
      setTitle(reason.title);
      setBodyMd(reason.body_md);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!title.trim()) return;
    setPending(true);
    await onSubmit({
      title: title.trim(),
      bodyMd,
      reasonId: reasonId || null,
      startsOn,
      endsOn: endsOn || null,
    });
    setPending(false);
  }

  return (
    <form onSubmit={handleSubmit} className="rsd-card" style={{ gap: 14, padding: "16px 18px" }}>
      <Select
        label="Reason"
        value={reasonId}
        onChange={(e) => handlePickReason(e.target.value)}
        help="Picking a template fills in the title and page content below — you can still tweak them for this closure."
      >
        <option value="">Custom / one-off</option>
        {reasons.map((r) => (
          <option key={r.id} value={r.id}>
            {r.title}
          </option>
        ))}
      </Select>
      <Input
        label="Title *"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="e.g. Wiffleball Weekend"
        required
      />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Input
          label="Not meeting from *"
          type="date"
          value={startsOn}
          onChange={(e) => setStartsOn(e.target.value)}
          required
        />
        <Input
          label="Through"
          type="date"
          value={endsOn ?? ""}
          onChange={(e) => setEndsOn(e.target.value)}
          help="The page flips back to the regular schedule after this date, so a closure can't be forgotten. Clear the field only if you want it up until someone turns it off."
        />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--gw-fg-muted)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
          Page content
        </span>
        <MarkdownEditor
          value={bodyMd}
          onChange={setBodyMd}
          rows={12}
          placeholder="What visitors see when they scan the door sign. Use Preview to check the formatting."
        />
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Pill variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          Cancel
        </Pill>
        <Pill variant="accent" size="sm" type="submit" disabled={pending || !title.trim()}>
          {pending ? "Saving…" : submitLabel}
        </Pill>
      </div>
    </form>
  );
}

interface ReasonFormValues {
  title: string;
  bodyMd: string;
  sortOrder: number;
}

function ReasonForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: ReasonFormValues;
  submitLabel: string;
  onSubmit: (values: ReasonFormValues) => void | Promise<void>;
  onCancel: () => void;
}) {
  const start: ReasonFormValues = initial ?? { title: "", bodyMd: "", sortOrder: 100 };
  const [title, setTitle] = useState(start.title);
  const [bodyMd, setBodyMd] = useState(start.bodyMd);
  const [sortOrder, setSortOrder] = useState(String(start.sortOrder));
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!title.trim()) return;
    setPending(true);
    await onSubmit({
      title: title.trim(),
      bodyMd,
      sortOrder: Number(sortOrder) || 100,
    });
    setPending(false);
  }

  return (
    <form onSubmit={handleSubmit} className="rsd-card" style={{ gap: 14, padding: "16px 18px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
        <Input
          label="Title *"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Lake Day"
          autoFocus
          required
        />
        <Input
          label="Sort order"
          type="number"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
        />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--gw-fg-muted)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
          Default page content
        </span>
        <MarkdownEditor
          value={bodyMd}
          onChange={setBodyMd}
          rows={8}
          placeholder="Copied into new closures that use this reason."
        />
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Pill variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          Cancel
        </Pill>
        <Pill variant="accent" size="sm" type="submit" disabled={pending || !title.trim()}>
          {pending ? "Saving…" : submitLabel}
        </Pill>
      </div>
    </form>
  );
}

function IconBtn({
  children,
  onClick,
  disabled,
  title,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
  title: string;
  danger?: boolean;
}) {
  const color = danger ? "var(--gw-error)" : "var(--gw-fg-muted)";
  const bg = danger ? "var(--gw-error-bg)" : "var(--gw-bg-elev)";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: bg,
        color,
        border: `1px solid ${danger ? "rgba(229,62,62,.25)" : "var(--gw-border)"}`,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </button>
  );
}
