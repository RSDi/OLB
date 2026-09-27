"use client";

import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "../../../components/icons";
import { Pill } from "../../../components/ui";
import { CHURCH_TZ } from "../../../../lib/dates/today";
import {
  albumItemMatches,
  albumMonthName,
  albumMonthOf,
  albumSearchText,
  albumUrlSearch,
  groupAlbumByMonth,
  orderAlbumItems,
  parseAlbumQuery,
  type AlbumFilters,
  type AlbumItem,
  type AlbumMediaKind,
  type AlbumMonthGroup,
  type AlbumSort,
  type AlbumUrlState,
} from "../../../../lib/slack-archive/album";
import { emojify } from "../../../../lib/slack-archive/emoji";
import { FilterDropdown, type FilterDropdownItem } from "../_shared/FilterDropdown";
import { ScrollToTopButton } from "../_shared/ScrollToTopButton";
import { AlbumLightbox } from "./AlbumLightbox";
import { MonthJump, type MonthJumpEntry } from "./MonthJump";

const SHORT_DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: CHURCH_TZ });
const URL_SYNC_DELAY_MS = 300;
// A preview whose signed URL has expired fails exactly like a broken one, so
// failures only count as expiry once the page is within this margin of the
// URLs' lifetime.
const EXPIRY_MARGIN_MS = 5 * 60 * 1000;
// The server renders only the first few screenfuls of tiles; the rest mount
// right after hydration. Every item is in the page data regardless (search
// needs it), so rendering all of them as HTML too would send each signed
// URL twice and make hydration walk thousands of tiles nobody can see yet.
const SERVER_TILE_LIMIT = 120;

type UrlFilterState = Omit<AlbumUrlState, "photo">;
type OpenDropdown = null | "channel" | "person" | "jump";

const subscribeToNothing = () => () => {};
// False during SSR and hydration, true after — the viewer renders through a
// portal into document.body, which only exists on the client.
function useIsClient(): boolean {
  return useSyncExternalStore(subscribeToNothing, () => true, () => false);
}

// Browser-only (reads the current path), for history entries.
function albumHref(state: UrlFilterState, photo: string | null): string {
  return `${window.location.pathname}${albumUrlSearch({ ...state, photo })}`;
}

function tileDomId(itemId: string): string {
  return `album-tile-${itemId}`;
}

function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

function plural(n: number, word: string): string {
  return `${formatCount(n)} ${word}${n === 1 ? "" : "s"}`;
}

function kindCountLabel(items: AlbumItem[]): string {
  const videos = items.filter((i) => i.kind === "video").length;
  const photos = items.length - videos;
  return [photos > 0 && plural(photos, "photo"), videos > 0 && plural(videos, "video")].filter(Boolean).join(", ");
}

function summarize(items: AlbumItem[]): string {
  if (items.length === 0) return "";
  const videos = items.filter((i) => i.kind === "video").length;
  const photos = items.length - videos;
  const channels = new Set(items.flatMap((i) => i.channelIds)).size;
  const what = [photos > 0 && plural(photos, "photo"), videos > 0 && plural(videos, "video")].filter(Boolean).join(" and ");
  const first = albumMonthOf(items[0].postedAt, CHURCH_TZ);
  const last = albumMonthOf(items[items.length - 1].postedAt, CHURCH_TZ);
  const name = (m: { year: number; month: number }) => `${albumMonthName(m.month)} ${m.year}`;
  const when = first.key === last.key ? `all in ${name(first)}` : `from ${name(first)} to ${name(last)}`;
  return `${what} shared in ${plural(channels, "channel")}, ${when}.`;
}

function captionSnippet(text: string): string {
  return emojify(text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*_~`>#\\]/g, "").replace(/\s+/g, " ").trim()).slice(0, 120);
}

export function AlbumView({
  items,
  channels,
  initialState,
  signedAt,
  previewTtlMs,
  notice,
}: {
  items: AlbumItem[]; // oldest first, as loadArchiveAlbum returns them
  channels: { id: string; label: string }[];
  initialState: AlbumUrlState;
  signedAt: number;
  previewTtlMs: number;
  notice?: React.ReactNode; // e.g. the preview-job status, under the summary
}) {
  const router = useRouter();
  const isClient = useIsClient();

  const [query, setQuery] = useState(initialState.q);
  const [kind, setKind] = useState<AlbumMediaKind | null>(initialState.kind);
  const [channelIds, setChannelIds] = useState<string[]>(initialState.channelIds);
  const [people, setPeople] = useState<string[]>(initialState.people);
  const [sort, setSort] = useState<AlbumSort>(initialState.sort);
  const [openId, setOpenId] = useState<string | null>(initialState.photo);
  const [openDropdown, setOpenDropdown] = useState<OpenDropdown>(null);
  const [previewsExpired, setPreviewsExpired] = useState(false);
  const [toolbarHeight, setToolbarHeight] = useState(0);
  const deferredQuery = useDeferredValue(query);

  const toolbarRef = useRef<HTMLDivElement>(null);
  const filterStateRef = useRef<UrlFilterState>({ q: query, kind, channelIds, people, sort });
  const itemsByIdRef = useRef<Map<string, AlbumItem>>(new Map());
  // Whether the open photo added its own history entry (so closing should
  // step back) or arrived that way in the URL (so closing just rewrites it).
  const pushedPhotoRef = useRef(false);
  const lastOpenIdRef = useRef<string | null>(null);

  const channelLabels = useMemo(() => new Map(channels.map((c) => [c.id, c.label])), [channels]);
  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const searchTextById = useMemo(
    () => new Map(items.map((i) => [i.id, albumSearchText(i, channelLabels, CHURCH_TZ)])),
    [items, channelLabels],
  );
  const ordered = useMemo(() => orderAlbumItems(items, sort), [items, sort]);
  const filters = useMemo<AlbumFilters>(
    () => ({ terms: parseAlbumQuery(deferredQuery), kind, channelIds, people }),
    [deferredQuery, kind, channelIds, people],
  );

  // One pass for the results plus faceted counts — each picker's numbers
  // honor every other filter but not its own, same rule as the search page.
  const { visible, kindCounts, channelCounts, personCounts } = useMemo(() => {
    const visible: AlbumItem[] = [];
    const kindCounts: Record<AlbumMediaKind, number> = { image: 0, video: 0 };
    const channelCounts = new Map<string, number>();
    const personCounts = new Map<string, number>();
    for (const item of ordered) {
      const text = searchTextById.get(item.id) ?? "";
      if (albumItemMatches(item, text, filters)) visible.push(item);
      if (albumItemMatches(item, text, filters, "kind")) kindCounts[item.kind] += 1;
      if (albumItemMatches(item, text, filters, "channel")) {
        for (const id of item.channelIds) channelCounts.set(id, (channelCounts.get(id) ?? 0) + 1);
      }
      if (albumItemMatches(item, text, filters, "person")) {
        personCounts.set(item.author, (personCounts.get(item.author) ?? 0) + 1);
      }
    }
    return { visible, kindCounts, channelCounts, personCounts };
  }, [ordered, searchTextById, filters]);

  const monthGroups = useMemo(() => groupAlbumByMonth(visible, CHURCH_TZ), [visible]);

  const years = useMemo(() => {
    const rendered = isClient ? visible : visible.slice(0, SERVER_TILE_LIMIT);
    const byYear: { year: number; months: AlbumMonthGroup[] }[] = [];
    for (const group of isClient ? monthGroups : groupAlbumByMonth(rendered, CHURCH_TZ)) {
      const current = byYear[byYear.length - 1];
      if (current && current.year === group.year) current.months.push(group);
      else byYear.push({ year: group.year, months: [group] });
    }
    return byYear;
  }, [isClient, visible, monthGroups]);

  const jumpEntries = useMemo<MonthJumpEntry[]>(
    () => monthGroups.map((m) => ({ key: m.key, year: m.year, month: m.month, count: m.items.length })),
    [monthGroups],
  );
  // Labels always describe the whole month, even in the server's partial render.
  const monthCountLabels = useMemo(
    () => new Map(monthGroups.map((m) => [m.key, kindCountLabel(m.items)])),
    [monthGroups],
  );

  // Channels in registry order (plus any the registry no longer lists);
  // people by how much they've shared. Zero-count options drop out unless
  // they're selected, so a selection can always be seen and undone.
  const channelItems = useMemo<FilterDropdownItem[]>(() => {
    const present = new Set(items.flatMap((i) => i.channelIds));
    const ids = [...channels.map((c) => c.id).filter((id) => present.has(id)), ...[...present].filter((id) => !channelLabels.has(id))];
    return ids
      .map((id) => ({ id, label: channelLabels.get(id) ?? id, count: channelCounts.get(id) ?? 0 }))
      .filter((c) => c.count > 0 || channelIds.includes(c.id));
  }, [items, channels, channelLabels, channelCounts, channelIds]);

  const personItems = useMemo<FilterDropdownItem[]>(() => {
    const names = [...new Set(items.map((i) => i.author))];
    return names
      .map((name) => ({ id: name, label: name, count: personCounts.get(name) ?? 0 }))
      .filter((p) => p.count > 0 || people.includes(p.id))
      .sort((a, b) => (b.count ?? 0) - (a.count ?? 0) || a.label.localeCompare(b.label));
  }, [items, personCounts, people]);

  const summary = useMemo(() => summarize(items), [items]);

  useEffect(() => {
    filterStateRef.current = { q: query, kind, channelIds, people, sort };
    itemsByIdRef.current = itemsById;
  });

  // Filters live in the URL (replaceState, so typing doesn't pile up history
  // entries) — a filtered view can be bookmarked, shared, or reloaded.
  useEffect(() => {
    const timer = setTimeout(() => {
      // Keeps an open photo's param; drops one naming a photo that no longer exists.
      const photo = new URLSearchParams(window.location.search).get("photo");
      const keptPhoto = photo && itemsByIdRef.current.has(photo) ? photo : null;
      const href = albumHref({ q: query, kind, channelIds, people, sort }, keptPhoto);
      if (href !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, "", href);
    }, URL_SYNC_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query, kind, channelIds, people, sort]);

  // Back/forward: opening a photo pushed an entry, so Back closes it.
  useEffect(() => {
    function onPopState() {
      const photo = new URLSearchParams(window.location.search).get("photo");
      pushedPhotoRef.current = false;
      setOpenId(photo && itemsByIdRef.current.has(photo) ? photo : null);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // When the viewer closes (by button, Esc, or Back), hand focus back to the
  // tile for whichever photo was last on screen.
  useEffect(() => {
    const last = lastOpenIdRef.current;
    lastOpenIdRef.current = openId;
    if (openId || !last) return;
    const tile = document.getElementById(tileDomId(last));
    if (tile) {
      tile.focus({ preventScroll: true });
      tile.scrollIntoView({ block: "nearest" });
    }
  }, [openId]);

  // The month labels stick just below the toolbar, whose height changes as
  // its controls wrap.
  useEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setToolbarHeight(el.offsetHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const openItem = useCallback((id: string) => {
    setOpenDropdown(null);
    // Bring the current entry up to date first, so Back lands on exactly the
    // filters the photo was opened from.
    window.history.replaceState(null, "", albumHref(filterStateRef.current, null));
    window.history.pushState(null, "", albumHref(filterStateRef.current, id));
    pushedPhotoRef.current = true;
    setOpenId(id);
  }, []);

  const navigateTo = useCallback((id: string) => {
    window.history.replaceState(null, "", albumHref(filterStateRef.current, id));
    setOpenId(id);
  }, []);

  const closeViewer = useCallback(() => {
    if (pushedPhotoRef.current) {
      pushedPhotoRef.current = false;
      window.history.back();
    } else {
      window.history.replaceState(null, "", albumHref(filterStateRef.current, null));
    }
    setOpenId(null);
  }, []);

  const handleTileBroken = useCallback(() => {
    if (Date.now() - signedAt > previewTtlMs - EXPIRY_MARGIN_MS) setPreviewsExpired(true);
  }, [signedAt, previewTtlMs]);

  function reloadPreviews() {
    setPreviewsExpired(false);
    router.refresh();
  }

  function jumpTo(key: string) {
    setOpenDropdown(null);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(`album-${key}`)?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  }

  function toggleDropdown(which: Exclude<OpenDropdown, null>) {
    setOpenDropdown((current) => (current === which ? null : which));
  }

  const hasFilters = query.trim() !== "" || kind !== null || channelIds.length > 0 || people.length > 0;
  function clearFilters() {
    setQuery("");
    setKind(null);
    setChannelIds([]);
    setPeople([]);
  }

  // The viewer steps through the current results; a photo opened from a
  // link that the filters would hide steps through the whole album instead.
  const visibleIndex = openId ? visible.findIndex((i) => i.id === openId) : -1;
  const viewerItems = visibleIndex >= 0 ? visible : ordered;
  const viewerIndex = visibleIndex >= 0 ? visibleIndex : openId ? ordered.findIndex((i) => i.id === openId) : -1;

  const otherFiltersHint = (facet: "channel" | "person") => {
    const others = query.trim() !== "" || kind !== null || (facet === "channel" ? people.length > 0 : channelIds.length > 0);
    return others ? "Counts reflect your other filters." : undefined;
  };

  return (
    <div className="rsd-album" style={{ "--album-toolbar-h": `${toolbarHeight}px` } as React.CSSProperties}>
      <header className="rsd-album-head">
        <h1 className="rsd-album-title">Photo Album</h1>
        {summary && <p className="rsd-album-summary">{summary}</p>}
        {notice}
      </header>

      <div ref={toolbarRef} className="rsd-slack-sticky-bar rsd-album-toolbar">
        <div className="rsd-album-search" data-tour="album-search">
          <Icons.Search width={16} height={16} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search captions, people, channels"
            aria-label="Search the album"
            enterKeyHint="search"
          />
          {query && (
            <button type="button" className="rsd-album-search-clear" onClick={() => setQuery("")} aria-label="Clear search">
              <Icons.X width={15} height={15} />
            </button>
          )}
        </div>
        <div className="rsd-album-controls" data-tour="album-controls">
          <div className="rsd-seg" role="group" aria-label="Show">
            {([
              [null, "All", kindCounts.image + kindCounts.video],
              ["image", "Photos", kindCounts.image],
              ["video", "Videos", kindCounts.video],
            ] as const).map(([value, label, count]) => (
              <button key={label} type="button" aria-pressed={kind === value} onClick={() => setKind(value)}>
                {label} <span className="rsd-album-seg-count">{formatCount(count)}</span>
              </button>
            ))}
          </div>
          {items.length > 0 && (
            <FilterDropdown
              label="Channel"
              items={channelItems}
              selected={channelIds}
              onChange={setChannelIds}
              open={openDropdown === "channel"}
              onOpenChange={() => toggleDropdown("channel")}
              searchPlaceholder="Search channels…"
              hint={otherFiltersHint("channel")}
              emptyMessage="No channels match your other filters."
            />
          )}
          {items.length > 0 && (
            <FilterDropdown
              label="People"
              items={personItems}
              selected={people}
              onChange={setPeople}
              open={openDropdown === "person"}
              onOpenChange={() => toggleDropdown("person")}
              searchPlaceholder="Search people…"
              hint={otherFiltersHint("person")}
              emptyMessage="No one matches your other filters."
            />
          )}
          <MonthJump
            entries={jumpEntries}
            open={openDropdown === "jump"}
            onOpenChange={() => toggleDropdown("jump")}
            onJump={jumpTo}
          />
          <Pill variant="ghost" size="sm" onClick={() => setSort((s) => (s === "newest" ? "oldest" : "newest"))}>
            {sort === "newest" ? "Newest first ↑" : "Oldest first ↓"}
          </Pill>
        </div>
      </div>

      {hasFilters && visible.length > 0 && (
        <div className="rsd-album-results" role="status">
          <span>
            Showing {formatCount(visible.length)} of {formatCount(items.length)}
          </span>
          <button type="button" onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <div className="rsd-album-empty">
          <Icons.Image width={28} height={28} />
          <p>No photos or videos yet. They appear here once they’re posted in an archived channel and the nightly sync picks them up.</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="rsd-album-empty">
          <Icons.Search width={28} height={28} />
          <p>No photos or videos match these filters.</p>
          <Pill variant="ghost" size="sm" onClick={clearFilters}>
            Clear filters
          </Pill>
        </div>
      ) : (
        <div className="rsd-album-timeline">
          {years.map((y) => (
            <section key={y.year} className="rsd-album-year" aria-label={String(y.year)}>
              <div className="rsd-album-year-num" aria-hidden="true">
                {y.year}
              </div>
              {y.months.map((m) => (
                <section key={m.key} id={`album-${m.key}`} className="rsd-album-month" aria-labelledby={`album-${m.key}-label`}>
                  <div className="rsd-album-month-label">
                    <h2 id={`album-${m.key}-label`} className="rsd-album-month-name">
                      {albumMonthName(m.month)} <span className="rsd-album-month-year">{m.year}</span>
                    </h2>
                    <div className="rsd-album-month-count">{monthCountLabels.get(m.key)}</div>
                  </div>
                  <div className="rsd-album-grid">
                    {m.items.map((item) => (
                      <AlbumTile key={item.id} item={item} onOpen={openItem} onBroken={handleTileBroken} />
                    ))}
                  </div>
                </section>
              ))}
            </section>
          ))}
        </div>
      )}

      {previewsExpired && (
        <div className="rsd-album-toast" role="status">
          <span>Previews have expired.</span>
          <button type="button" onClick={reloadPreviews}>
            Reload previews
          </button>
        </div>
      )}

      <ScrollToTopButton />

      {isClient && viewerIndex >= 0 && (
        <AlbumLightbox
          items={viewerItems}
          index={viewerIndex}
          itemsById={itemsById}
          channelLabels={channelLabels}
          onNavigate={navigateTo}
          onClose={closeViewer}
        />
      )}
    </div>
  );
}

const PlayGlyph = () => (
  <svg width="9" height="10" viewBox="0 0 9 10" aria-hidden="true">
    <path d="M0 0.8v8.4c0 .6.7 1 1.2.7l7-4.2c.5-.3.5-1.1 0-1.4l-7-4.2C.7-.2 0 .2 0 .8z" fill="currentColor" />
  </svg>
);

const AlbumTile = memo(function AlbumTile({
  item,
  onOpen,
  onBroken,
}: {
  item: AlbumItem;
  onOpen: (id: string) => void;
  onBroken: () => void;
}) {
  // Keyed to the URL that failed, so a refresh that brings a new signed URL
  // gets a fresh attempt automatically.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const src = item.thumbUrl;
  const showImage = Boolean(src) && failedSrc !== src;

  // An image that fails before hydration never fires onError, so check the
  // element's own state once it's attached. (Skipped for SVG, which can
  // legitimately report no natural size.)
  const imgRef = useCallback(
    (img: HTMLImageElement | null) => {
      if (!img || !img.complete || img.naturalWidth > 0 || /svg/i.test(item.mimetype)) return;
      const failed = img.getAttribute("src");
      if (!failed) return;
      setFailedSrc(failed);
      onBroken();
    },
    [item.mimetype, onBroken],
  );

  const date = SHORT_DATE.format(new Date(item.postedAt));
  const kindWord = item.kind === "video" ? "Video" : "Photo";
  const caption = item.text ? `: ${captionSnippet(item.text)}` : "";

  return (
    <button
      type="button"
      id={tileDomId(item.id)}
      className="rsd-album-tile"
      data-kind={item.kind}
      data-tour="album-tile"
      onClick={() => onOpen(item.id)}
      aria-label={`${kindWord} by ${item.author}, ${date}${caption}`}
    >
      {showImage ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed Storage URL, not a static asset next/image can optimize */}
          <img
            ref={imgRef}
            src={src!}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => {
              setFailedSrc(src);
              onBroken();
            }}
          />
          {item.kind === "video" ? (
            <span className="rsd-album-badge" aria-hidden="true">
              <PlayGlyph />
            </span>
          ) : /gif$/i.test(item.mimetype) ? (
            <span className="rsd-album-badge" aria-hidden="true">
              GIF
            </span>
          ) : null}
        </>
      ) : (
        <span className="rsd-album-tile-fallback" aria-hidden="true">
          {item.kind === "video" ? (
            <span className="rsd-album-tile-play">
              <PlayGlyph />
            </span>
          ) : (
            <Icons.Image width={22} height={22} />
          )}
          <span className="rsd-album-tile-name">{item.name}</span>
        </span>
      )}
      <span className="rsd-album-tile-caption" aria-hidden="true">
        <span className="rsd-album-tile-author">{item.author}</span>
        <span className="rsd-album-tile-date">{date}</span>
      </span>
    </button>
  );
});
