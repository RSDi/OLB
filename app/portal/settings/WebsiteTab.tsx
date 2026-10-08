"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icons } from "../../components/icons";
import { Input, Pill, Textarea } from "../../components/ui";
import { createClient } from "../../../lib/supabase/client";
import {
  resetSiteMenu,
  resetSiteSlot,
  saveSiteImage,
  saveSiteMenu,
  saveSiteText,
  type WebsiteResult,
} from "../../../lib/website/actions";
import { parseImageValue, SITE_ALT_MAX } from "../../../lib/website/content";
import {
  DEFAULT_MENU,
  MENU_LABEL_MAX,
  menuFromRows,
  menuToInput,
  SITE_PAGES,
  type MenuInput,
  type MenuRow,
} from "../../../lib/website/menu";
import { SITE_SLOTS, type ImageSlot, type SiteSlot } from "../../../lib/website/slots";
import { uploadSiteImage } from "../../../lib/website/upload";

type Section = "menu" | "pages";

// Settings → Website: the public club website's menu, page text and
// pictures. A board member with the Website grant, or a super-admin.
export function WebsiteTab() {
  const [section, setSection] = useState<Section>("menu");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500, maxWidth: 560 }}>
          Change the public club website: the menu across the top, and the words and pictures on its pages. Changes
          show on the site as soon as you save.
        </div>
        <a href="/" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
          <Pill variant="ghost" size="sm">
            <Icons.ExternalLink width={14} height={14} /> View site
          </Pill>
        </a>
      </div>

      <div data-tour="website-sections" role="tablist" style={{ display: "flex", gap: 6 }}>
        {(
          [
            ["menu", "Menu"],
            ["pages", "Pages"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            data-tour={key === "menu" ? "website-section-menu" : "website-section-pages"}
            aria-selected={section === key}
            onClick={() => setSection(key)}
            style={{
              padding: "6px 14px",
              borderRadius: 100,
              border: "1px solid var(--gw-border)",
              background: section === key ? "var(--gw-ink)" : "transparent",
              color: section === key ? "#fff" : "var(--gw-fg)",
              fontSize: 12.5,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {section === "menu" ? <MenuEditor /> : <PagesEditor />}
    </div>
  );
}

// ─── Menu ────────────────────────────────────────────────────────────────────

interface DraftLink {
  id: string;
  label: string;
  href: string;
}
interface DraftItem extends DraftLink {
  kind: "link" | "folder";
  children: DraftLink[];
}

let nextId = 0;
const newId = () => `d${++nextId}`;

function toDraft(menu: MenuInput[]): DraftItem[] {
  return menu.map((m) => ({
    id: newId(),
    kind: m.children.length ? "folder" : "link",
    label: m.label,
    href: m.href,
    children: m.children.map((c) => ({ id: newId(), label: c.label, href: c.href })),
  }));
}

function fromDraft(draft: DraftItem[]): MenuInput[] {
  return draft.map((d) =>
    d.kind === "folder"
      ? { label: d.label, href: "", children: d.children.map((c) => ({ label: c.label, href: c.href })) }
      : { label: d.label, href: d.href, children: [] },
  );
}

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function MenuEditor() {
  const [saved, setSaved] = useState<MenuInput[] | null>(null);
  // True while the site uses the menu built into the code.
  const [usingDefault, setUsingDefault] = useState(true);
  const [draft, setDraft] = useState<DraftItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: loadError } = await createClient()
      .from("site_menu_items")
      .select("id, parent_id, label, href, sort_order");
    if (loadError) {
      setError(loadError.message);
      setLoading(false);
      return;
    }
    const fromDb = menuFromRows((data as MenuRow[]) ?? []);
    const menu = menuToInput(fromDb ?? DEFAULT_MENU);
    setUsingDefault(!fromDb);
    setSaved(menu);
    setDraft(toDraft(menu));
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads once on mount
    load();
  }, [load]);

  const dirty = useMemo(
    () => saved !== null && JSON.stringify(fromDraft(draft)) !== JSON.stringify(saved),
    [draft, saved],
  );

  async function run(action: () => Promise<WebsiteResult>, done: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await action();
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    await load();
    setNotice(done);
  }

  function save() {
    const empty = draft.find((d) => d.kind === "folder" && d.children.length === 0);
    if (empty) {
      setError(`The folder "${empty.label || "Untitled"}" has no links. Add one, or delete the folder.`);
      return;
    }
    run(() => saveSiteMenu(fromDraft(draft)), "Menu saved. It's on the site now.");
  }

  function resetToOriginal() {
    if (!confirm("Put the website's original menu back? Your changes to the menu will be lost.")) return;
    run(resetSiteMenu, "The original menu is back on the site.");
  }

  const update = (id: string, patch: Partial<DraftItem>) =>
    setDraft((d) => d.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  const updateChild = (parentId: string, childId: string, patch: Partial<DraftLink>) =>
    setDraft((d) =>
      d.map((item) =>
        item.id === parentId
          ? { ...item, children: item.children.map((c) => (c.id === childId ? { ...c, ...patch } : c)) }
          : item,
      ),
    );

  if (loading) return <Loading />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <datalist id="website-site-pages">
        {SITE_PAGES.map((p) => (
          <option key={p.href} value={p.href}>
            {p.label}
          </option>
        ))}
      </datalist>

      <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
        Each item is a <strong>link</strong> or a <strong>folder</strong> that opens to show its own links. Links go
        to a page on the site (like <code>/coaches</code>) or to any web address, which opens in a new tab.
        {usingDefault && " The site is showing its original menu."}
      </div>

      <Banner error={error} notice={notice} />

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {draft.map((item, i) => (
          <div key={item.id} data-tour="website-menu-item" className="rsd-card" style={{ gap: 10, padding: "12px 14px" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
              <OrderButtons
                name={item.label}
                first={i === 0}
                last={i === draft.length - 1}
                disabled={busy}
                onMove={(dir) => setDraft((d) => move(d, i, i + dir))}
              />
              <span style={{ alignSelf: "center", color: "var(--gw-fg-muted)" }} title={item.kind === "folder" ? "Folder" : "Link"}>
                {item.kind === "folder" ? <Icons.ChevronDown width={16} height={16} /> : <Icons.ExternalLink width={14} height={14} />}
              </span>
              <div style={{ flex: "1 1 160px", minWidth: 0 }}>
                <Input
                  label={item.kind === "folder" ? "Folder name" : "Label"}
                  value={item.label}
                  maxLength={MENU_LABEL_MAX}
                  onChange={(e) => update(item.id, { label: e.target.value })}
                  disabled={busy}
                />
              </div>
              {item.kind === "link" && (
                <div style={{ flex: "2 1 220px", minWidth: 0 }}>
                  <Input
                    label="Goes to"
                    value={item.href}
                    list="website-site-pages"
                    placeholder="/coaches or https://…"
                    onChange={(e) => update(item.id, { href: e.target.value })}
                    disabled={busy}
                  />
                </div>
              )}
              <IconButton
                title={`Delete ${item.label || "this item"}`}
                danger
                disabled={busy}
                onClick={() => {
                  if (item.kind === "folder" && item.children.length && !confirm(`Delete the folder "${item.label}" and its links?`)) return;
                  setDraft((d) => d.filter((x) => x.id !== item.id));
                }}
              >
                <Icons.Trash width={14} height={14} />
              </IconButton>
            </div>

            {item.kind === "folder" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingLeft: 36 }}>
                {item.children.map((child, j) => (
                  <div key={child.id} style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
                    <OrderButtons
                      name={child.label}
                      first={j === 0}
                      last={j === item.children.length - 1}
                      disabled={busy}
                      onMove={(dir) => update(item.id, { children: move(item.children, j, j + dir) })}
                    />
                    <div style={{ flex: "1 1 140px", minWidth: 0 }}>
                      <Input
                        label="Label"
                        value={child.label}
                        maxLength={MENU_LABEL_MAX}
                        onChange={(e) => updateChild(item.id, child.id, { label: e.target.value })}
                        disabled={busy}
                      />
                    </div>
                    <div style={{ flex: "2 1 200px", minWidth: 0 }}>
                      <Input
                        label="Goes to"
                        value={child.href}
                        list="website-site-pages"
                        placeholder="/coaches or https://…"
                        onChange={(e) => updateChild(item.id, child.id, { href: e.target.value })}
                        disabled={busy}
                      />
                    </div>
                    <IconButton
                      title={`Delete ${child.label || "this link"}`}
                      danger
                      disabled={busy}
                      onClick={() => update(item.id, { children: item.children.filter((c) => c.id !== child.id) })}
                    >
                      <Icons.Trash width={14} height={14} />
                    </IconButton>
                  </div>
                ))}
                <div>
                  <Pill
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => update(item.id, { children: [...item.children, { id: newId(), label: "", href: "" }] })}
                  >
                    <Icons.Plus width={13} height={13} /> Add link to {item.label || "folder"}
                  </Pill>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "space-between" }}>
        <div data-tour="website-menu-add" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Pill
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => setDraft((d) => [...d, { id: newId(), kind: "link", label: "", href: "", children: [] }])}
          >
            <Icons.Plus width={13} height={13} /> Add link
          </Pill>
          <Pill
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() =>
              setDraft((d) => [
                ...d,
                { id: newId(), kind: "folder", label: "", href: "", children: [{ id: newId(), label: "", href: "" }] },
              ])
            }
          >
            <Icons.Plus width={13} height={13} /> Add folder
          </Pill>
        </div>
        <div data-tour="website-menu-save" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {!usingDefault && (
            <Pill variant="ghost" size="sm" disabled={busy} onClick={resetToOriginal}>
              <Icons.Undo width={13} height={13} /> Reset to original
            </Pill>
          )}
          <Pill
            variant="ghost"
            size="sm"
            disabled={busy || !dirty}
            onClick={() => {
              setDraft(toDraft(saved ?? []));
              setError(null);
            }}
          >
            Discard changes
          </Pill>
          <Pill variant="accent" size="sm" disabled={busy || !dirty} onClick={save}>
            {busy ? "Saving…" : "Save menu"}
          </Pill>
        </div>
      </div>
    </div>
  );
}

// ─── Pages: text and pictures ────────────────────────────────────────────────

interface SavedRow {
  value: string;
  updated_at: string;
}

function PagesEditor() {
  const pages = useMemo(() => [...new Set(SITE_SLOTS.map((s) => s.page))], []);
  const [page, setPage] = useState(pages[0]);
  const [saved, setSaved] = useState<Record<string, SavedRow>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: loadError } = await createClient().from("site_content").select("key, value, updated_at");
    if (loadError) setError(loadError.message);
    else
      setSaved(
        Object.fromEntries(
          ((data as { key: string; value: string; updated_at: string }[]) ?? []).map((r) => [
            r.key,
            { value: r.value, updated_at: r.updated_at },
          ]),
        ),
      );
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads once on mount
    load();
  }, [load]);

  if (loading) return <Loading />;

  const slots = SITE_SLOTS.filter((s) => s.page === page) as readonly SiteSlot[];
  const pageHref = SITE_PAGES.find((p) => p.label === page)?.href ?? "/";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div data-tour="website-pages" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {pages.map((p) => {
          const edited = SITE_SLOTS.some((s) => s.page === p && saved[s.key]);
          return (
            <button
              key={p}
              type="button"
              onClick={() => setPage(p)}
              style={{
                padding: "5px 12px",
                borderRadius: 100,
                border: "1px solid",
                borderColor: page === p ? "var(--rsd-accent)" : "var(--gw-border)",
                background: page === p ? "var(--rsd-accent-bg)" : "transparent",
                color: page === p ? "var(--rsd-accent)" : "var(--gw-fg-muted)",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {p}
              {edited && " •"}
            </button>
          );
        })}
      </div>

      <Banner error={error} notice={null} />

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <a href={pageHref} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, fontWeight: 700, color: "var(--rsd-accent)" }}>
          Open this page on the site ↗
        </a>
      </div>

      {slots.map((slot) =>
        slot.kind === "image" ? (
          <ImageSlotCard key={slot.key} slot={slot} saved={saved[slot.key] ?? null} onSaved={load} />
        ) : (
          <TextSlotCard key={slot.key} slot={slot} saved={saved[slot.key] ?? null} onSaved={load} />
        ),
      )}
    </div>
  );
}

function SlotHeader({ slot, saved }: { slot: SiteSlot; saved: SavedRow | null }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
      <span style={{ fontSize: 14, fontWeight: 800 }}>{slot.label}</span>
      {saved ? (
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--rsd-accent)" }}>
          Edited {new Date(saved.updated_at).toLocaleDateString()}
        </span>
      ) : (
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--gw-fg-muted)" }}>Original</span>
      )}
      {slot.help && (
        <span style={{ flexBasis: "100%", fontSize: 12, fontWeight: 500, color: "var(--gw-fg-muted)" }}>{slot.help}</span>
      )}
    </div>
  );
}

function TextSlotCard({
  slot,
  saved,
  onSaved,
}: {
  slot: Exclude<SiteSlot, ImageSlot>;
  saved: SavedRow | null;
  onSaved: () => Promise<void>;
}) {
  const current = saved?.value ?? slot.default;
  const [value, setValue] = useState(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const multiline = slot.kind === "markdown" || slot.multiline;

  // Pick up a save or reset (the saved value changing underneath).
  const [lastCurrent, setLastCurrent] = useState(current);
  if (current !== lastCurrent) {
    setLastCurrent(current);
    setValue(current);
  }

  async function run(action: () => Promise<WebsiteResult>, done: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await action();
    if (result.error) setError(result.error);
    else {
      await onSaved();
      setNotice(done);
    }
    setBusy(false);
  }

  return (
    <div data-tour="website-slot" className="rsd-card" style={{ gap: 10, padding: "14px 16px" }}>
      <SlotHeader slot={slot} saved={saved} />
      {multiline ? (
        <Textarea
          value={value}
          rows={slot.kind === "markdown" ? Math.min(14, Math.max(4, Math.ceil(value.length / 90))) : 3}
          onChange={(e) => setValue(e.target.value)}
          disabled={busy}
          aria-label={slot.label}
        />
      ) : (
        <Input
          value={value}
          maxLength={slot.kind === "text" ? slot.max : undefined}
          onChange={(e) => setValue(e.target.value)}
          disabled={busy}
          aria-label={slot.label}
        />
      )}
      {slot.kind === "markdown" && (
        <span style={{ fontSize: 11.5, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
          Leave a blank line between paragraphs. <code>**bold**</code>, <code>*italic*</code>,{" "}
          <code>[link words](/page)</code>, and lines starting with <code>- </code> for a list.
        </span>
      )}
      <Banner error={error} notice={notice} />
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
        {saved && (
          <Pill
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => {
              if (confirm(`Put the original ${slot.label.toLowerCase()} back on the ${slot.page} page?`)) {
                run(() => resetSiteSlot(slot.key), "The original is back on the site.");
              }
            }}
          >
            <Icons.Undo width={13} height={13} /> Reset to original
          </Pill>
        )}
        <Pill variant="ghost" size="sm" disabled={busy || value === current} onClick={() => setValue(current)}>
          Discard changes
        </Pill>
        <Pill
          variant="accent"
          size="sm"
          disabled={busy || value === current}
          onClick={() => run(() => saveSiteText(slot.key, value), "Saved. It's on the site now.")}
        >
          {busy ? "Saving…" : "Save"}
        </Pill>
      </div>
    </div>
  );
}

function ImageSlotCard({
  slot,
  saved,
  onSaved,
}: {
  slot: ImageSlot;
  saved: SavedRow | null;
  onSaved: () => Promise<void>;
}) {
  const image = parseImageValue(saved?.value);
  const shownUrl = image?.url ?? slot.default.src;
  const currentAlt = image ? image.alt : slot.defaultAlt;
  const [alt, setAlt] = useState(currentAlt);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [lastAlt, setLastAlt] = useState(currentAlt);
  if (currentAlt !== lastAlt) {
    setLastAlt(currentAlt);
    setAlt(currentAlt);
  }

  async function run(label: string, action: () => Promise<WebsiteResult>, done: string) {
    setBusy(label);
    setError(null);
    setNotice(null);
    const result = await action();
    if (result.error) setError(result.error);
    else {
      await onSaved();
      setNotice(done);
    }
    setBusy(null);
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    await run(
      "upload",
      async () => {
        const up = await uploadSiteImage(file);
        if (up.error || !up.url || !up.width || !up.height) return { error: up.error ?? "Upload failed." };
        return saveSiteImage(slot.key, { url: up.url, width: up.width, height: up.height, alt });
      },
      "New picture saved. It's on the site now.",
    );
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div data-tour="website-slot" className="rsd-card" style={{ gap: 12, padding: "14px 16px" }}>
      <SlotHeader slot={slot} saved={saved} />
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a preview of whatever is on the site */}
        <img
          src={shownUrl}
          alt={alt || slot.label}
          style={{
            width: 220,
            maxWidth: "100%",
            maxHeight: 220,
            objectFit: "contain",
            borderRadius: 8,
            border: "1px solid var(--gw-border)",
            background: "var(--gw-bg-elev)",
          }}
        />
        <div style={{ flex: "1 1 240px", display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
          <Input
            label="Description"
            help="Read aloud to people who can't see the picture. Describe what's in it; leave empty for a purely decorative background."
            value={alt}
            maxLength={SITE_ALT_MAX}
            onChange={(e) => setAlt(e.target.value)}
            disabled={!!busy}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            style={{ display: "none" }}
            onChange={(e) => onFile(e.target.files?.[0])}
          />
          <Banner error={error} notice={notice} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Pill variant="accent" size="sm" disabled={!!busy} onClick={() => fileRef.current?.click()}>
              <Icons.Image width={13} height={13} /> {busy === "upload" ? "Uploading…" : "Upload new picture"}
            </Pill>
            {image && alt !== currentAlt && (
              <Pill
                variant="ghost"
                size="sm"
                disabled={!!busy}
                onClick={() => run("alt", () => saveSiteImage(slot.key, { ...image, alt }), "Description saved.")}
              >
                {busy === "alt" ? "Saving…" : "Save description"}
              </Pill>
            )}
            {saved && (
              <Pill
                variant="ghost"
                size="sm"
                disabled={!!busy}
                onClick={() => {
                  if (confirm(`Put the original ${slot.label.toLowerCase()} back on the ${slot.page} page?`)) {
                    run("reset", () => resetSiteSlot(slot.key), "The original picture is back on the site.");
                  }
                }}
              >
                <Icons.Undo width={13} height={13} /> Reset to original
              </Pill>
            )}
          </div>
          {!image && (
            <span style={{ fontSize: 11.5, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
              Type the description first, then upload: it&apos;s saved with the new picture. JPEG, PNG, WebP or GIF, up
              to 10 MB.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Bits ────────────────────────────────────────────────────────────────────

function Loading() {
  return (
    <div style={{ padding: "40px 0", textAlign: "center", color: "var(--gw-fg-muted)", fontSize: 13 }}>Loading…</div>
  );
}

function Banner({ error, notice }: { error: string | null; notice: string | null }) {
  if (!error && !notice) return null;
  const isError = !!error;
  return (
    <div
      role={isError ? "alert" : "status"}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: isError ? "var(--gw-error-bg)" : "var(--rsd-accent-bg)",
        border: `1px solid ${isError ? "rgba(229,62,62,.25)" : "var(--rsd-accent)"}`,
        borderRadius: 10,
        padding: "10px 14px",
        fontSize: 13,
        color: isError ? "var(--gw-error)" : "var(--rsd-accent)",
        fontWeight: 600,
      }}
    >
      {isError ? <Icons.AlertCircle width={16} height={16} /> : <Icons.Check width={16} height={16} />}
      {error ?? notice}
    </div>
  );
}

function OrderButtons({
  name,
  first,
  last,
  disabled,
  onMove,
}: {
  name: string;
  first: boolean;
  last: boolean;
  disabled: boolean;
  onMove: (dir: -1 | 1) => void;
}) {
  const btn = (dir: -1 | 1, off: boolean, label: string, icon: React.ReactNode) => (
    <button
      type="button"
      aria-label={label}
      disabled={off || disabled}
      onClick={() => onMove(dir)}
      style={{
        width: 26,
        height: 20,
        borderRadius: 6,
        border: "none",
        background: "transparent",
        color: "var(--gw-fg-muted)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: off || disabled ? "default" : "pointer",
        opacity: off || disabled ? 0.3 : 1,
        padding: 0,
      }}
    >
      {icon}
    </button>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, alignSelf: "center" }}>
      {btn(-1, first, `Move ${name || "item"} up`, <Icons.ChevronUp width={13} height={13} />)}
      {btn(1, last, `Move ${name || "item"} down`, <Icons.ChevronDown width={13} height={13} />)}
    </div>
  );
}

function IconButton({
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
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      style={{
        width: 42,
        height: 42,
        borderRadius: 8,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        background: danger ? "var(--gw-error-bg)" : "var(--gw-bg-elev)",
        color: danger ? "var(--gw-error)" : "var(--gw-fg-muted)",
        border: `1px solid ${danger ? "rgba(229,62,62,.25)" : "var(--gw-border)"}`,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </button>
  );
}
