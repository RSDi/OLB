"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icons } from "../../components/icons";
import { Input, Pill, Textarea } from "../../components/ui";
import { createClient } from "../../../lib/supabase/client";
import {
  discardDraft,
  publishDrafts,
  resetSiteMenu,
  resetSiteSlot,
  saveSiteImage,
  saveSiteLink,
  saveSiteList,
  saveSiteMenu,
  saveSiteText,
  type WebsiteResult,
} from "../../../lib/website/actions";
import {
  isBuiltinImage,
  normalizeSlug,
  parseImageRef,
  parseImageValue,
  parseLink,
  parseList,
  SITE_ALT_MAX,
  type ImageRef,
  type LinkValue,
  type ListField,
  type ListItem,
} from "../../../lib/website/content";
import {
  DEFAULT_MENU,
  MENU_LABEL_MAX,
  menuFromRows,
  menuToInput,
  SITE_PAGES,
  type MenuInput,
  type MenuRow,
} from "../../../lib/website/menu";
import {
  BUILTIN_IMAGES,
  findSlot,
  PAGE_PATHS,
  SITE_SLOTS,
  type ImageSlot,
  type LinkSlot,
  type ListSlot,
  type MarkdownSlot,
  type SiteSlot,
  type TextSlot,
} from "../../../lib/website/slots";
import { uploadSiteImage } from "../../../lib/website/upload";

// ─── Data ────────────────────────────────────────────────────────────────────

interface Draft {
  // Null: back to the original once published.
  value: string | null;
  updated_at: string;
}

interface SiteData {
  live: Record<string, { value: string; updated_at: string }>;
  drafts: Record<string, Draft>;
  // The published menu, or null while the site uses its built-in one.
  liveMenu: MenuInput[] | null;
}

// What a spot holds right now in the editor: its draft if it has one, else
// what's published. Null means the original (built into the page).
function effective(data: SiteData, key: string): string | null {
  if (key in data.drafts) return data.drafts[key].value;
  return data.live[key]?.value ?? null;
}

function draftName(key: string): string {
  if (key === "menu") return "Menu";
  const slot = findSlot(key);
  if (!slot) return key;
  return slot.label === slot.page ? slot.label : `${slot.page}: ${slot.label}`;
}

type Section = "menu" | "pages";

// Settings → Website: the public club website's menu, page text, pictures,
// buttons and lists, and pages of the board's own. A board member with the
// Website grant, or a super-admin. Changes save as drafts, which only the
// editors see in the preview, until someone publishes them.
export function WebsiteTab() {
  const [section, setSection] = useState<Section>("menu");
  const [data, setData] = useState<SiteData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [content, drafts, menu] = await Promise.all([
      supabase.from("site_content").select("key, value, updated_at"),
      supabase.from("site_drafts").select("key, value, updated_at"),
      supabase.from("site_menu_items").select("id, parent_id, label, href, sort_order"),
    ]);
    const failed = content.error ?? drafts.error ?? menu.error;
    if (failed) {
      setError(failed.message);
      return;
    }
    const liveMenu = menuFromRows((menu.data as MenuRow[]) ?? []);
    setData({
      live: Object.fromEntries(
        ((content.data as { key: string; value: string; updated_at: string }[]) ?? []).map((r) => [
          r.key,
          { value: r.value, updated_at: r.updated_at },
        ]),
      ),
      drafts: Object.fromEntries(
        ((drafts.data as { key: string; value: string | null; updated_at: string }[]) ?? []).map((r) => [
          r.key,
          { value: r.value, updated_at: r.updated_at },
        ]),
      ),
      liveMenu: liveMenu ? menuToInput(liveMenu) : null,
    });
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads once on mount
    load();
  }, [load]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500, maxWidth: 620 }}>
        Change the public club website: the menu across the top, the words, pictures and buttons on its pages, and
        pages of your own. Changes save as <strong>drafts</strong>: tap <strong>Preview</strong> to see them on the
        site (only you can), then <strong>Publish</strong> to put them live.
      </div>

      {error && <Banner error={error} notice={null} />}
      {!data ? (
        !error && <Loading />
      ) : (
        <>
          <DraftsBar data={data} onChanged={load} />

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
                aria-selected={section === key}
                data-tour={key === "menu" ? "website-section-menu" : "website-section-pages"}
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

          {section === "menu" ? <MenuEditor data={data} onSaved={load} /> : <PagesEditor data={data} onSaved={load} />}
        </>
      )}
    </div>
  );
}

// ─── Unpublished changes ─────────────────────────────────────────────────────

function DraftsBar({ data, onChanged }: { data: SiteData; onChanged: () => Promise<void> }) {
  const keys = Object.keys(data.drafts).sort((a, b) => draftName(a).localeCompare(draftName(b)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function run(action: () => Promise<WebsiteResult & { published?: number }>, done: (n?: number) => string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await action();
    if (result.error) setError(result.error);
    else {
      await onChanged();
      setNotice(done(result.published));
    }
    setBusy(false);
  }

  return (
    <div
      data-tour="website-drafts"
      className="rsd-card"
      style={{
        gap: 10,
        padding: "14px 16px",
        borderColor: keys.length ? "var(--rsd-accent)" : undefined,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 14, fontWeight: 800 }}>
          {keys.length === 0
            ? "Everything is published."
            : `${keys.length} unpublished change${keys.length === 1 ? "" : "s"}`}
        </span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a
            href="/api/website/preview?path=/"
            target="_blank"
            rel="noopener noreferrer"
            data-tour="website-preview"
            style={{ textDecoration: "none" }}
          >
            <Pill variant="ghost" size="sm">
              <Icons.ExternalLink width={13} height={13} /> {keys.length ? "Preview" : "View site"}
            </Pill>
          </a>
          {keys.length > 0 && (
            <>
              <Pill
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => {
                  if (confirm("Throw away every unpublished change? This can't be undone.")) {
                    run(() => discardDraft(null), () => "Unpublished changes thrown away.");
                  }
                }}
              >
                Discard all
              </Pill>
              <span data-tour="website-publish" style={{ display: "inline-flex" }}>
                <Pill
                  variant="accent"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    if (confirm(`Publish ${keys.length} change${keys.length === 1 ? "" : "s"} to the live website?`)) {
                      run(publishDrafts, (n) => `Published ${n ?? keys.length} change${n === 1 ? "" : "s"}. They're on the site now.`);
                    }
                  }}
                >
                  {busy ? "Working…" : "Publish"}
                </Pill>
              </span>
            </>
          )}
        </div>
      </div>
      {keys.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {keys.map((k) => (
            <span
              key={k}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "3px 4px 3px 10px",
                borderRadius: 100,
                background: "var(--rsd-accent-bg)",
                color: "var(--rsd-accent)",
                fontSize: 11.5,
                fontWeight: 700,
              }}
            >
              {draftName(k)}
              {data.drafts[k].value === null && " (back to original)"}
              <button
                type="button"
                aria-label={`Discard the draft of ${draftName(k)}`}
                title="Discard this draft"
                disabled={busy}
                onClick={() => run(() => discardDraft(k), () => `Draft of ${draftName(k)} thrown away.`)}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "inherit",
                  cursor: "pointer",
                  padding: "0 4px",
                  fontSize: 14,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <Banner error={error} notice={notice} />
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

// The menu the editor starts from: its draft, else the published one, else
// the site's own.
function currentMenu(data: SiteData): MenuInput[] {
  if ("menu" in data.drafts) {
    const v = data.drafts.menu.value;
    if (v === null) return menuToInput(DEFAULT_MENU);
    try {
      return JSON.parse(v) as MenuInput[];
    } catch {
      return menuToInput(DEFAULT_MENU);
    }
  }
  return data.liveMenu ?? menuToInput(DEFAULT_MENU);
}

// The pages a link can go to: the site's own, and the new ones.
function linkablePages(data: SiteData): { href: string; label: string }[] {
  const pages = parseList(effective(data, "pages.list")) ?? [];
  return [
    ...SITE_PAGES,
    ...pages
      .filter((p) => typeof p.slug === "string" && p.slug)
      .map((p) => ({ href: `/${p.slug}`, label: typeof p.title === "string" ? p.title : String(p.slug) })),
  ];
}

function PageOptions({ id, data }: { id: string; data: SiteData }) {
  return (
    <datalist id={id}>
      {linkablePages(data).map((p) => (
        <option key={p.href} value={p.href}>
          {p.label}
        </option>
      ))}
    </datalist>
  );
}

function MenuEditor({ data, onSaved }: { data: SiteData; onSaved: () => Promise<void> }) {
  const savedMenu = "menu" in data.drafts ? (data.drafts.menu.value ?? "original") : JSON.stringify(data.liveMenu);
  const current = useMemo(() => currentMenu(data), [data]);
  const [draft, setDraft] = useSynced<DraftItem[]>(toDraft(current), savedMenu);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const hasDraft = "menu" in data.drafts;
  const isOriginal = hasDraft ? data.drafts.menu.value === null : data.liveMenu === null;
  const dirty = JSON.stringify(fromDraft(draft)) !== JSON.stringify(current);

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

  function save() {
    const empty = draft.find((d) => d.kind === "folder" && d.children.length === 0);
    if (empty) {
      setError(`The folder "${empty.label || "Untitled"}" has no links. Add one, or delete the folder.`);
      return;
    }
    run(() => saveSiteMenu(fromDraft(draft)), "Menu saved as a draft. Preview it, then publish.");
  }

  const update = (id: string, patch: Partial<DraftItem>) =>
    setDraft(draft.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  const updateChild = (parentId: string, childId: string, patch: Partial<DraftLink>) =>
    setDraft(
      draft.map((item) =>
        item.id === parentId
          ? { ...item, children: item.children.map((c) => (c.id === childId ? { ...c, ...patch } : c)) }
          : item,
      ),
    );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <PageOptions id="website-site-pages" data={data} />

      <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
        Each item is a <strong>link</strong> or a <strong>folder</strong> that opens to show its own links. Links go
        to a page on the site (like <code>/coaches</code>, or one of your new pages) or to any web address, which
        opens in a new tab. <Status draft={hasDraft} original={isOriginal} />
      </div>

      <Banner error={error} notice={notice} />
      {draft.length > 5 && (
        <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--gw-fg-muted)" }}>
          Heads up: with more than 5 items the menu wraps onto two lines on a laptop screen. A folder keeps it tidy.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {draft.map((item, i) => (
          <div key={item.id} data-tour="website-menu-item" className="rsd-card" style={{ gap: 10, padding: "12px 14px" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
              <OrderButtons
                name={item.label}
                first={i === 0}
                last={i === draft.length - 1}
                disabled={busy}
                onMove={(dir) => setDraft(move(draft, i, i + dir))}
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
                  setDraft(draft.filter((x) => x.id !== item.id));
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
            onClick={() => setDraft([...draft, { id: newId(), kind: "link", label: "", href: "", children: [] }])}
          >
            <Icons.Plus width={13} height={13} /> Add link
          </Pill>
          <Pill
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() =>
              setDraft([
                ...draft,
                { id: newId(), kind: "folder", label: "", href: "", children: [{ id: newId(), label: "", href: "" }] },
              ])
            }
          >
            <Icons.Plus width={13} height={13} /> Add folder
          </Pill>
        </div>
        <div data-tour="website-menu-save" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {!isOriginal && (
            <Pill
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => {
                if (confirm("Put the website's original menu back? This saves a draft; publish to make it live.")) {
                  run(resetSiteMenu, "The original menu is saved as a draft. Publish to put it back on the site.");
                }
              }}
            >
              <Icons.Undo width={13} height={13} /> Reset to original
            </Pill>
          )}
          <Pill
            variant="ghost"
            size="sm"
            disabled={busy || !dirty}
            onClick={() => {
              setDraft(toDraft(current));
              setError(null);
            }}
          >
            Discard changes
          </Pill>
          <Pill variant="accent" size="sm" disabled={busy || !dirty} onClick={save}>
            {busy ? "Saving…" : "Save draft"}
          </Pill>
        </div>
      </div>
    </div>
  );
}

// ─── Pages ───────────────────────────────────────────────────────────────────

function PagesEditor({ data, onSaved }: { data: SiteData; onSaved: () => Promise<void> }) {
  const pages = useMemo(() => [...new Set(SITE_SLOTS.map((s) => s.page as string))], []);
  const [page, setPage] = useState(pages[0]);
  const slots = (SITE_SLOTS as readonly SiteSlot[]).filter((s) => s.page === page);
  const pagePath = PAGE_PATHS[page];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div data-tour="website-pages" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {pages.map((p) => {
          const keys = SITE_SLOTS.filter((s) => s.page === p).map((s) => s.key as string);
          const drafted = keys.some((k) => k in data.drafts);
          const edited = keys.some((k) => k in data.live);
          return (
            <button
              key={p}
              type="button"
              onClick={() => setPage(p)}
              title={drafted ? "Has unpublished changes" : edited ? "Has published changes" : undefined}
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
              {drafted ? " ◆" : edited ? " •" : ""}
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 11.5, color: "var(--gw-fg-muted)", fontWeight: 600 }}>
        ◆ has unpublished changes · • has published changes
      </div>

      {pagePath && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <a
            href={`/api/website/preview?path=${encodeURIComponent(pagePath)}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 12, fontWeight: 700, color: "var(--rsd-accent)" }}
          >
            Preview this page ↗
          </a>
        </div>
      )}

      {slots.map((slot) => {
        switch (slot.kind) {
          case "image":
            return <ImageSlotCard key={slot.key} slot={slot} data={data} onSaved={onSaved} />;
          case "link":
            return <LinkSlotCard key={slot.key} slot={slot} data={data} onSaved={onSaved} />;
          case "list":
            return <ListSlotCard key={slot.key} slot={slot} data={data} onSaved={onSaved} />;
          default:
            return <TextSlotCard key={slot.key} slot={slot} data={data} onSaved={onSaved} />;
        }
      })}
    </div>
  );
}

// Runs a save and reports how it went, for one spot's card.
function useSlotAction(onSaved: () => Promise<void>) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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
  return { busy, error, notice, run };
}

type Run = ReturnType<typeof useSlotAction>["run"];

const SAVED = "Saved as a draft. Preview it, then publish.";

interface CardProps<S> {
  slot: S;
  data: SiteData;
  onSaved: () => Promise<void>;
}

// Keeps a card's form in step with what's saved: when the saved value
// (`savedKey`) changes underneath — a save, reset, discard or publish —
// start over from it.
function useSynced<T>(initial: T, savedKey: string): [T, (v: T) => void] {
  const [value, setValue] = useState(initial);
  const [last, setLast] = useState(savedKey);
  if (savedKey !== last) {
    setLast(savedKey);
    setValue(initial);
  }
  return [value, setValue];
}

// The card around one spot: its name, status and hint, then the editor, then
// the buttons.
function SlotCard({
  slot,
  data,
  children,
  footer,
}: {
  slot: SiteSlot;
  data: SiteData;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div data-tour="website-slot" className="rsd-card" style={{ gap: 12, padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 14, fontWeight: 800 }}>{slot.label}</span>
        <Status draft={slot.key in data.drafts} original={effective(data, slot.key) === null} />
        {slot.help && (
          <span style={{ flexBasis: "100%", fontSize: 12, fontWeight: 500, color: "var(--gw-fg-muted)" }}>{slot.help}</span>
        )}
      </div>
      {children}
      {footer}
    </div>
  );
}

function ResetButton({ slot, data, busy, run }: { slot: SiteSlot; data: SiteData; busy: string | null; run: Run }) {
  if (effective(data, slot.key) === null) return null;
  return (
    <Pill
      variant="ghost"
      size="sm"
      disabled={!!busy}
      onClick={() => {
        if (confirm(`Put the original ${slot.label.toLowerCase()} back on the ${slot.page} page? This saves a draft; publish to make it live.`)) {
          run("reset", () => resetSiteSlot(slot.key), "The original is saved as a draft. Publish to put it back on the site.");
        }
      }}
    >
      <Icons.Undo width={13} height={13} /> Reset to original
    </Pill>
  );
}

function SlotButtons({
  slot,
  data,
  busy,
  dirty,
  onSave,
  onDiscard,
  run,
}: {
  slot: SiteSlot;
  data: SiteData;
  busy: string | null;
  dirty: boolean;
  onSave: () => void;
  onDiscard: () => void;
  run: Run;
}) {
  return (
    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
      <ResetButton slot={slot} data={data} busy={busy} run={run} />
      <Pill variant="ghost" size="sm" disabled={!!busy || !dirty} onClick={onDiscard}>
        Discard changes
      </Pill>
      <Pill variant="accent" size="sm" disabled={!!busy || !dirty} onClick={onSave}>
        {busy === "save" ? "Saving…" : "Save draft"}
      </Pill>
    </div>
  );
}

function TextSlotCard({ slot, data, onSaved }: CardProps<TextSlot | MarkdownSlot>) {
  const current = effective(data, slot.key) ?? slot.default;
  const [value, setValue] = useSynced(current, current);
  const { busy, error, notice, run } = useSlotAction(onSaved);
  const multiline = slot.kind === "markdown" || slot.multiline;

  return (
    <SlotCard
      slot={slot}
      data={data}
      footer={
        <>
          <Banner error={error} notice={notice} />
          <SlotButtons
            slot={slot}
            data={data}
            busy={busy}
            dirty={value !== current}
            onSave={() => run("save", () => saveSiteText(slot.key, value), SAVED)}
            onDiscard={() => setValue(current)}
            run={run}
          />
        </>
      }
    >
      {multiline ? (
        <Textarea
          value={value}
          rows={slot.kind === "markdown" ? Math.min(14, Math.max(4, Math.ceil(value.length / 90))) : 3}
          onChange={(e) => setValue(e.target.value)}
          disabled={!!busy}
          aria-label={slot.label}
        />
      ) : (
        <Input
          value={value}
          maxLength={slot.kind === "text" ? slot.max : undefined}
          onChange={(e) => setValue(e.target.value)}
          disabled={!!busy}
          aria-label={slot.label}
        />
      )}
      {slot.kind === "markdown" && <MarkdownHint />}
    </SlotCard>
  );
}

function MarkdownHint() {
  return (
    <span style={{ fontSize: 11.5, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
      Leave a blank line between paragraphs. <code>**bold**</code>, <code>*italic*</code>,{" "}
      <code>[link words](/page)</code>, and lines starting with <code>- </code> for a list. A bold line on its own
      gets a little space above it, like a heading.
    </span>
  );
}

function LinkSlotCard({ slot, data, onSaved }: CardProps<LinkSlot>) {
  const saved = effective(data, slot.key);
  const current = parseLink(saved) ?? slot.default;
  const [value, setValue] = useSynced<LinkValue>(current, saved ?? "");
  const { busy, error, notice, run } = useSlotAction(onSaved);
  const listId = `website-link-${slot.key}`;

  return (
    <SlotCard
      slot={slot}
      data={data}
      footer={
        <>
          <Banner error={error} notice={notice} />
          <SlotButtons
            slot={slot}
            data={data}
            busy={busy}
            dirty={value.label !== current.label || value.href !== current.href}
            onSave={() => run("save", () => saveSiteLink(slot.key, value), SAVED)}
            onDiscard={() => setValue(current)}
            run={run}
          />
        </>
      }
    >
      <PageOptions id={listId} data={data} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        <Input
          label="Words on the button"
          value={value.label}
          maxLength={slot.max}
          onChange={(e) => setValue({ ...value, label: e.target.value })}
          disabled={!!busy}
        />
        <Input
          label="Goes to"
          value={value.href}
          list={listId}
          placeholder="/contact or https://…"
          onChange={(e) => setValue({ ...value, href: e.target.value })}
          disabled={!!busy}
        />
      </div>
    </SlotCard>
  );
}

function ImageSlotCard({ slot, data, onSaved }: CardProps<ImageSlot>) {
  const saved = effective(data, slot.key);
  const image = parseImageValue(saved);
  const currentAlt = image ? image.alt : slot.defaultAlt;
  const [alt, setAlt] = useSynced(currentAlt, saved ?? "");
  const { busy, error, notice, run } = useSlotAction(onSaved);

  return (
    <SlotCard
      slot={slot}
      data={data}
      footer={
        <>
          <Banner error={error} notice={notice} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {image && !isBuiltinImage(image) && alt !== currentAlt && (
              <Pill
                variant="ghost"
                size="sm"
                disabled={!!busy}
                onClick={() => run("alt", () => saveSiteImage(slot.key, { ...image, alt }), "Description saved as a draft.")}
              >
                {busy === "alt" ? "Saving…" : "Save description"}
              </Pill>
            )}
            <ResetButton slot={slot} data={data} busy={busy} run={run} />
          </div>
        </>
      }
    >
      <PictureField
        src={image && !isBuiltinImage(image) ? image.url : slot.default.src}
        alt={alt}
        onAlt={setAlt}
        disabled={!!busy}
        onUpload={(up) =>
          run("upload", () => saveSiteImage(slot.key, { ...up, alt }), "New picture saved as a draft. Preview it, then publish.")
        }
        uploadHint={!image}
      />
    </SlotCard>
  );
}

// A picture's preview, its description, and Upload. `onUpload` gets the
// uploaded file's address and size.
function PictureField({
  src,
  alt,
  onAlt,
  disabled,
  onUpload,
  onRemove,
  uploadHint,
}: {
  src: string | null;
  alt: string;
  onAlt: (alt: string) => void;
  disabled: boolean;
  onUpload: (up: { url: string; width: number; height: number }) => void | Promise<void>;
  onRemove?: () => void;
  uploadHint?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setUploading(true);
    const up = await uploadSiteImage(file);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    if (up.error || !up.url || !up.width || !up.height) {
      setError(up.error ?? "Upload failed.");
      return;
    }
    await onUpload({ url: up.url, width: up.width, height: up.height });
  }

  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
      {src ? (
        /* eslint-disable-next-line @next/next/no-img-element -- a preview of whatever is on the site */
        <img
          src={src}
          alt={alt || "Current picture"}
          style={{
            width: 180,
            maxWidth: "100%",
            maxHeight: 180,
            objectFit: "contain",
            borderRadius: 8,
            border: "1px solid var(--gw-border)",
            background: "var(--gw-bg-elev)",
          }}
        />
      ) : (
        <div
          style={{
            width: 180,
            height: 110,
            borderRadius: 8,
            border: "1px dashed var(--gw-border)",
            display: "grid",
            placeItems: "center",
            color: "var(--gw-fg-muted)",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          No picture
        </div>
      )}
      <div style={{ flex: "1 1 220px", display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
        <Input
          label="Description"
          aria-label="Description"
          help="Read aloud to people who can't see the picture. Describe what's in it; leave empty for a purely decorative background."
          value={alt}
          maxLength={SITE_ALT_MAX}
          onChange={(e) => onAlt(e.target.value)}
          disabled={disabled}
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          style={{ display: "none" }}
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        {error && <Banner error={error} notice={null} />}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Pill variant="ghost" size="sm" disabled={disabled || uploading} onClick={() => fileRef.current?.click()}>
            <Icons.Image width={13} height={13} /> {uploading ? "Uploading…" : "Upload new picture"}
          </Pill>
          {onRemove && src && (
            <Pill variant="ghost" size="sm" disabled={disabled} onClick={onRemove}>
              Remove picture
            </Pill>
          )}
        </div>
        {uploadHint && (
          <span style={{ fontSize: 11.5, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
            Type the description first, then upload: it&apos;s saved with the new picture. JPEG, PNG, WebP or GIF, up to
            10 MB.
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Lists ───────────────────────────────────────────────────────────────────

interface EditItem {
  id: string;
  values: ListItem;
}

const toEdit = (items: readonly ListItem[]): EditItem[] => items.map((values) => ({ id: newId(), values: { ...values } }));

function imageSrc(ref: ImageRef | null): string | null {
  if (!ref) return null;
  return isBuiltinImage(ref) ? (BUILTIN_IMAGES[ref.builtin]?.src ?? null) : ref.url;
}

function ListSlotCard({ slot, data, onSaved }: CardProps<ListSlot>) {
  const saved = effective(data, slot.key);
  const current = useMemo(() => parseList(saved) ?? [...slot.default], [saved, slot.default]);
  const [items, setItems] = useSynced<EditItem[]>(toEdit(current), saved ?? "");
  const [open, setOpen] = useState<string | null>(null);
  const { busy, error, notice, run } = useSlotAction(onSaved);
  const dirty = JSON.stringify(items.map((i) => i.values)) !== JSON.stringify(current);
  const titleField = slot.fields.find((f) => f.type === "text")?.name ?? slot.fields[0].name;
  const slugField = slot.fields.find((f) => f.type === "slug")?.name;
  const savedSlugs = new Set(current.map((c) => (slugField ? c[slugField] : null)).filter(Boolean));
  const noun = slot.itemName;

  const set = (id: string, patch: ListItem) =>
    setItems(items.map((it) => (it.id === id ? { ...it, values: { ...it.values, ...patch } } : it)));

  return (
    <SlotCard
      slot={slot}
      data={data}
      footer={
        <>
          <Banner error={error} notice={notice} />
          <div style={{ display: "flex", gap: 8, justifyContent: "space-between", flexWrap: "wrap" }}>
            <Pill
              variant="ghost"
              size="sm"
              disabled={!!busy || items.length >= slot.max}
              onClick={() => {
                const it: EditItem = {
                  id: newId(),
                  values: Object.fromEntries(slot.fields.map((f) => [f.name, f.type === "image" ? null : ""])),
                };
                setItems([...items, it]);
                setOpen(it.id);
              }}
            >
              <Icons.Plus width={13} height={13} /> Add {noun}
            </Pill>
            <SlotButtons
              slot={slot}
              data={data}
              busy={busy}
              dirty={dirty}
              onSave={() => run("save", () => saveSiteList(slot.key, items.map((i) => i.values)), SAVED)}
              onDiscard={() => setItems(toEdit(current))}
              run={run}
            />
          </div>
        </>
      }
    >
      {items.length === 0 && (
        <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>None yet. Tap Add {noun}.</div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((it, i) => {
          const title = typeof it.values[titleField] === "string" ? (it.values[titleField] as string) : "";
          const slug = slugField && typeof it.values[slugField] === "string" ? (it.values[slugField] as string) : "";
          const isOpen = open === it.id;
          return (
            <div
              key={it.id}
              data-tour="website-list-item"
              style={{ border: "1px solid var(--gw-border)", borderRadius: 10, padding: "6px 10px" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <OrderButtons
                  name={title}
                  first={i === 0}
                  last={i === items.length - 1}
                  disabled={!!busy}
                  onMove={(dir) => setItems(move(items, i, i + dir))}
                />
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : it.id)}
                  aria-expanded={isOpen}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    textAlign: "left",
                    border: "none",
                    background: "transparent",
                    color: "var(--gw-fg)",
                    fontSize: 13.5,
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 0",
                  }}
                >
                  {isOpen ? <Icons.ChevronUp width={14} height={14} /> : <Icons.ChevronDown width={14} height={14} />}
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {title || `New ${noun}`}
                  </span>
                  {slug && <span style={{ fontSize: 11.5, color: "var(--gw-fg-muted)", fontWeight: 600 }}>/{slug}</span>}
                </button>
                <IconButton
                  title={`Delete ${title || `this ${noun}`}`}
                  danger
                  disabled={!!busy}
                  onClick={() => {
                    if (confirm(`Take ${title || `this ${noun}`} off the list? Nothing changes on the site until you save and publish.`)) {
                      setItems(items.filter((x) => x.id !== it.id));
                    }
                  }}
                >
                  <Icons.Trash width={14} height={14} />
                </IconButton>
              </div>
              {isOpen && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "8px 4px 8px" }}>
                  {slot.fields.map((f) => (
                    <ListFieldEditor
                      key={f.name}
                      field={f}
                      value={it.values[f.name] ?? null}
                      disabled={!!busy}
                      onChange={(v) =>
                        set(
                          it.id,
                          // A new page's address follows its title until it's saved.
                          slugField && f.name === titleField && typeof v === "string" && !savedSlugs.has(slug)
                            ? { [f.name]: v, [slugField]: normalizeSlug(v) }
                            : { [f.name]: v },
                        )
                      }
                      previewPath={f.type === "slug" && slug && savedSlugs.has(slug) ? `/${slug}` : null}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </SlotCard>
  );
}

function ListFieldEditor({
  field,
  value,
  disabled,
  onChange,
  previewPath,
}: {
  field: ListField;
  value: ListItem[string];
  disabled: boolean;
  onChange: (v: ListItem[string]) => void;
  previewPath: string | null;
}) {
  const label = `${field.label}${field.required ? " *" : ""}`;
  const text = typeof value === "string" ? value : "";

  if (field.type === "image") {
    const ref = parseImageRef(value);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--gw-fg-muted)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
          {label}
        </span>
        {field.help && <span style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 500 }}>{field.help}</span>}
        <PictureField
          src={imageSrc(ref)}
          alt={ref?.alt ?? ""}
          onAlt={(alt) => onChange(ref ? { ...ref, alt } : null)}
          disabled={disabled}
          onUpload={(up) => onChange({ ...up, alt: ref?.alt ?? "" })}
          onRemove={field.required ? undefined : () => onChange(null)}
        />
      </div>
    );
  }

  if (field.type === "markdown") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Textarea
          label={label}
          aria-label={field.label}
          help={field.help}
          value={text}
          rows={Math.min(14, Math.max(4, Math.ceil(text.length / 90)))}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
        <MarkdownHint />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <Input
        label={label}
        aria-label={field.label}
        help={field.help}
        value={text}
        maxLength={field.max}
        placeholder={field.type === "url" ? "https://… or /contact" : field.type === "slug" ? "fall-camp" : undefined}
        onChange={(e) => onChange(e.target.value)}
        onBlur={field.type === "slug" ? () => onChange(normalizeSlug(text)) : undefined}
        disabled={disabled}
      />
      {previewPath && (
        <a
          href={`/api/website/preview?path=${encodeURIComponent(previewPath)}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 12, fontWeight: 700, color: "var(--rsd-accent)" }}
        >
          Preview {previewPath} ↗
        </a>
      )}
    </div>
  );
}

// ─── Bits ────────────────────────────────────────────────────────────────────

function Status({ draft, original }: { draft: boolean; original: boolean }) {
  const [text, color] = draft
    ? [original ? "Draft: back to original" : "Draft", "var(--rsd-accent)"]
    : original
      ? ["Original", "var(--gw-fg-muted)"]
      : ["Published", "var(--gw-fg-muted)"];
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        color,
        border: `1px solid ${draft ? "var(--rsd-accent)" : "var(--gw-border)"}`,
        borderRadius: 100,
        padding: "1px 8px",
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}

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
