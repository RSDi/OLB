"use client";
import { useState, type CSSProperties } from "react";
import { Pill, Input, Textarea, Select } from "../../components/ui";
import { SideSheet } from "../../components/SideSheet";
import { Icons } from "../../components/icons";
import { saveRoadmapItem, deleteRoadmapItem, setRoadmapLink, type RoadmapResult } from "../../../lib/roadmap/actions";
import {
  AREAS,
  STATUSES,
  TITLE_MAX,
  DESCRIPTION_MAX,
  columnItems,
  formatDay,
  todayIso,
  type RoadmapItem,
  type Status,
} from "../../../lib/roadmap/model";

// One view, two modes: "edit" is the super-admins' board at /portal/roadmap;
// "public" is the read-only copy families open from the shared link
// (/roadmap/<key>), which never gets the actions or the link's key.

type Mode = "edit" | "public";
type Sheet = { kind: "item"; item: RoadmapItem | null; status: Status } | { kind: "link" } | null;

const DOT: Record<Status, string> = {
  released: "var(--gw-success)",
  progress: "var(--rsd-accent-fill)",
  planned: "var(--gw-fg-muted)",
  proposed: "var(--gw-fg-faint)",
};

export function RoadmapView({
  items,
  mode,
  linkKey = null,
  error = null,
}: {
  items: RoadmapItem[];
  mode: Mode;
  linkKey?: string | null;
  error?: string | null;
}) {
  const editable = mode === "edit";
  const [area, setArea] = useState<string>("all");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [toast, setToast] = useState<string | null>(null);

  const visible = area === "all" ? items : items.filter((i) => i.area === area);
  const areaCount = (a: string) => items.filter((i) => i.area === a).length;
  // On the shared link, only the areas that have something in them.
  const areas = AREAS.filter((a) => editable || areaCount(a) > 0);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 2500);
  };
  const done = (msg: string) => {
    setSheet(null);
    flash(msg);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <div role="group" aria-label="Area" style={{ display: "flex", flexWrap: "wrap", gap: 6, flex: "1 1 auto" }}>
          <Chip on={area === "all"} onClick={() => setArea("all")}>All · {items.length}</Chip>
          {areas.map((a) => (
            <Chip key={a} on={area === a} onClick={() => setArea(area === a ? "all" : a)}>
              {a} · {areaCount(a)}
            </Chip>
          ))}
        </div>
        {editable && (
          <div style={{ display: "flex", gap: 8 }}>
            <Pill variant="ghost" size="sm" onClick={() => setSheet({ kind: "link" })}>
              <Icons.Link width={14} height={14} /> Share link
            </Pill>
            <Pill variant="accent" size="sm" onClick={() => setSheet({ kind: "item", item: null, status: "planned" })}>
              <Icons.Plus width={14} height={14} /> Add item
            </Pill>
          </div>
        )}
      </div>

      {error && (
        <div role="alert" style={{ padding: "12px 14px", borderRadius: 10, background: "var(--gw-error-bg)", color: "var(--gw-error)", fontSize: 14 }}>
          {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14, alignItems: "start" }}>
        {STATUSES.map((s) => {
          const list = columnItems(visible, s.key);
          return (
            <section key={s.key} aria-label={s.label} style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
              <header style={{ display: "flex", flexDirection: "column", gap: 2, padding: "0 2px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: 9, background: DOT[s.key], flexShrink: 0 }} />
                  <h2 style={{ margin: 0, fontSize: 13, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--gw-fg)" }}>{s.label}</h2>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--gw-fg-muted)" }}>{list.length}</span>
                  {editable && s.key !== "released" && (
                    <button
                      type="button"
                      aria-label={`Add to ${s.label}`}
                      onClick={() => setSheet({ kind: "item", item: null, status: s.key })}
                      style={{ marginLeft: "auto", display: "flex", padding: 4, border: 0, borderRadius: 6, background: "transparent", color: "var(--gw-fg-muted)", cursor: "pointer" }}
                    >
                      <Icons.Plus width={14} height={14} />
                    </button>
                  )}
                </div>
                <span style={{ fontSize: 12, color: "var(--gw-fg-muted)" }}>{editable ? s.hint : s.publicHint}</span>
              </header>
              {list.length ? (
                list.map((it) => (
                  <Card key={it.id} it={it} onOpen={editable ? () => setSheet({ kind: "item", item: it, status: it.status }) : undefined} />
                ))
              ) : (
                <div style={{ padding: "18px 12px", border: "1px dashed var(--gw-border)", borderRadius: 12, fontSize: 13, color: "var(--gw-fg-muted)", textAlign: "center" }}>
                  Nothing here yet.
                </div>
              )}
            </section>
          );
        })}
      </div>

      {sheet?.kind === "item" && (
        <ItemSheet
          key={sheet.item?.id ?? "new"}
          item={sheet.item}
          status={sheet.status}
          onClose={() => setSheet(null)}
          onDone={done}
        />
      )}
      {sheet?.kind === "link" && <LinkSheet linkKey={linkKey} onClose={() => setSheet(null)} onDone={flash} />}

      {toast && (
        <div role="status" style={{ position: "fixed", left: "50%", bottom: 24, transform: "translateX(-50%)", zIndex: 80, padding: "10px 16px", borderRadius: 100, background: "var(--gw-ink)", color: "#fff", fontSize: 13, fontWeight: 600, boxShadow: "var(--gw-shadow-3)" }}>
          {toast}
        </div>
      )}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className="gw-press"
      style={{
        padding: "7px 12px",
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

function Card({ it, onOpen }: { it: RoadmapItem; onOpen?: () => void }) {
  const style: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: 14,
    borderRadius: 12,
    border: "1px solid var(--gw-border)",
    borderLeft: it.status === "progress" ? "3px solid var(--rsd-accent-fill)" : "1px solid var(--gw-border)",
    background: "var(--gw-bg-elev)",
    color: "var(--gw-fg)",
    textAlign: "left",
    font: "inherit",
    width: "100%",
    cursor: onOpen ? "pointer" : "default",
  };
  const body = (
    <>
      <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--gw-fg-muted)" }}>
        {it.area}
        {it.released_on && <span style={{ marginLeft: "auto", textTransform: "none", letterSpacing: 0 }}>{formatDay(it.released_on)}</span>}
      </span>
      <span style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.3 }}>{it.title}</span>
      {it.description && (
        <span style={{ fontSize: 13, lineHeight: 1.5, color: "var(--gw-fg-muted)", whiteSpace: "pre-wrap" }}>{it.description}</span>
      )}
    </>
  );
  return onOpen ? (
    <button type="button" onClick={onOpen} className="gw-press" style={style}>
      {body}
    </button>
  ) : (
    <div style={style}>{body}</div>
  );
}

function ItemSheet({
  item,
  status: startStatus,
  onClose,
  onDone,
}: {
  item: RoadmapItem | null;
  status: Status;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [area, setArea] = useState<string>(item?.area ?? AREAS[0]);
  const [status, setStatus] = useState<Status>(startStatus);
  const [releasedOn, setReleasedOn] = useState(item?.released_on ?? todayIso());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const run = async (fn: () => Promise<RoadmapResult>, msg: string) => {
    setBusy(true);
    setErr(null);
    const res = await fn();
    setBusy(false);
    if (res.error) setErr(res.error);
    else onDone(msg);
  };

  const save = () =>
    run(() => saveRoadmapItem(item?.id ?? null, { title, description, area, status, releasedOn }), item ? "Saved" : "Added");

  return (
    <SideSheet
      eyebrow="Roadmap"
      title={item ? "Edit item" : "Add item"}
      busy={busy}
      onClose={onClose}
      footer={
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {item &&
            (confirmDelete ? (
              <Pill size="sm" disabled={busy} onClick={() => run(() => deleteRoadmapItem(item.id), "Deleted")} style={{ color: "var(--gw-error)" }}>
                Yes, delete it
              </Pill>
            ) : (
              <Pill size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmDelete(true)}>
                <Icons.Trash width={14} height={14} /> Delete
              </Pill>
            ))}
          <span style={{ flex: 1 }} />
          <Pill size="sm" variant="ghost" disabled={busy} onClick={onClose}>Cancel</Pill>
          <Pill size="sm" variant="accent" disabled={busy} onClick={save}>{busy ? "Saving…" : item ? "Save" : "Add item"}</Pill>
        </div>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        style={{ display: "flex", flexDirection: "column", gap: 16 }}
      >
        <Input label="Title" value={title} maxLength={TITLE_MAX} onChange={(e) => setTitle(e.target.value)} autoFocus={!item} />
        <Textarea
          label="Description"
          help="A sentence or two in plain words. Families read this on the shared link."
          value={description}
          maxLength={DESCRIPTION_MAX}
          rows={4}
          onChange={(e) => setDescription(e.target.value)}
        />
        <Select label="Area" value={area} onChange={(e) => setArea(e.target.value)}>
          {AREAS.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </Select>
        <Select label="Column" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
          {STATUSES.map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </Select>
        {status === "released" && (
          <Input label="Went live on" type="date" value={releasedOn} onChange={(e) => setReleasedOn(e.target.value)} />
        )}
        {err && <div role="alert" style={{ fontSize: 13, color: "var(--gw-error)" }}>{err}</div>}
      </form>
    </SideSheet>
  );
}

function LinkSheet({ linkKey, onClose, onDone }: { linkKey: string | null; onClose: () => void; onDone: (msg: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const url = linkKey ? `${window.location.origin}/roadmap/${linkKey}` : null;

  const change = async (action: "new" | "off", msg: string) => {
    setBusy(true);
    setErr(null);
    const res = await setRoadmapLink(action);
    setBusy(false);
    if (res.error) setErr(res.error);
    else onDone(msg);
  };

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      onDone("Link copied");
    } catch {
      setErr("Couldn't copy. Select the link and copy it yourself.");
    }
  };

  return (
    <SideSheet eyebrow="Roadmap" title="Share link" busy={busy} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, fontSize: 14, lineHeight: 1.6 }}>
        <p style={{ margin: 0, color: "var(--gw-fg-muted)" }}>
          Anyone with the link can read the roadmap without signing in. They see the titles, descriptions, areas and dates, and can&apos;t change anything.
        </p>
        {url ? (
          <>
            <Input label="Link" value={url} readOnly onFocus={(e) => e.target.select()} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Pill size="sm" variant="accent" disabled={busy} onClick={copy}>Copy link</Pill>
              <Pill size="sm" variant="ghost" disabled={busy} onClick={() => change("new", "New link made")}>New link</Pill>
              <Pill size="sm" variant="ghost" disabled={busy} onClick={() => change("off", "Link turned off")}>Turn off</Pill>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: "var(--gw-fg-muted)" }}>
              &quot;New link&quot; and &quot;Turn off&quot; stop the old link working.
            </p>
          </>
        ) : (
          <div>
            <Pill size="sm" variant="accent" disabled={busy} onClick={() => change("new", "Link turned on")}>Turn on link</Pill>
          </div>
        )}
        {err && <div role="alert" style={{ fontSize: 13, color: "var(--gw-error)" }}>{err}</div>}
      </div>
    </SideSheet>
  );
}
