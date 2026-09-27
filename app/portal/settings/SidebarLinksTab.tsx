"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "../../components/icons";
import { Input, Pill } from "../../components/ui";
import { createClient } from "../../../lib/supabase/client";
import {
  createSidebarLink,
  deleteSidebarLink,
  moveSidebarLink,
  updateSidebarLink,
  type SidebarLinkInput,
  type SidebarLinkResult,
} from "../../../lib/sidebar-links/actions";
import { SIDEBAR_LINK_LABEL_MAX, type SidebarLink } from "../../../lib/sidebar-links/url";

function fetchLinks() {
  return createClient()
    .from("sidebar_links")
    .select("id, label, url, open_in_new_tab, sort_order")
    .order("sort_order")
    .order("label");
}

// Settings → Sidebar Links: extra links everyone sees under the sidebar's
// built-in items, like the season schedule. Super-admin only.
export function SidebarLinksTab() {
  const router = useRouter();
  const [rows, setRows] = useState<SidebarLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback(({ data, error: loadError }: Awaited<ReturnType<typeof fetchLinks>>) => {
    if (loadError) setError(loadError.message);
    else setRows((data as SidebarLink[]) ?? []);
    setLoading(false);
  }, []);

  const load = useCallback(async () => apply(await fetchLinks()), [apply]);

  useEffect(() => {
    let cancelled = false;
    fetchLinks().then((r) => {
      if (!cancelled) apply(r);
    });
    return () => {
      cancelled = true;
    };
  }, [apply]);

  // Runs an action, then reloads the list and the sidebar. False on error.
  async function run(id: string, action: () => Promise<SidebarLinkResult>): Promise<boolean> {
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

  async function handleAdd(values: SidebarLinkInput) {
    if (await run("new", () => createSidebarLink(values))) setAdding(false);
  }

  async function handleUpdate(id: string, values: SidebarLinkInput) {
    if (await run(id, () => updateSidebarLink(id, values))) setEditingId(null);
  }

  async function handleDelete(link: SidebarLink) {
    if (!confirm(`Remove "${link.label}" from the sidebar?`)) return;
    await run(link.id, () => deleteSidebarLink(link.id));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500, maxWidth: 540 }}>
          Extra links everyone sees at the bottom of the sidebar — the season schedule, a sign-up
          form, the club store. Links open in a new browser tab unless you turn that off.
        </div>
        {!adding && (
          <Pill variant="accent" size="sm" onClick={() => { setAdding(true); setError(null); }}>
            <Icons.Plus width={14} height={14} /> Add link
          </Pill>
        )}
      </div>

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

      {adding && (
        <LinkForm
          submitLabel="Add link"
          onCancel={() => {
            setAdding(false);
            setError(null);
          }}
          onSubmit={handleAdd}
        />
      )}

      {loading ? (
        <div style={{ padding: "40px 0", textAlign: "center", color: "var(--gw-fg-muted)", fontSize: 13 }}>
          Loading…
        </div>
      ) : rows.length === 0 ? (
        <div className="rsd-card" style={{ textAlign: "center", padding: "40px 24px" }}>
          <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
            No sidebar links yet.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map((link, i) =>
            editingId === link.id ? (
              <LinkForm
                key={link.id}
                initial={{ label: link.label, url: link.url, openInNewTab: link.open_in_new_tab }}
                submitLabel="Save"
                onCancel={() => {
                  setEditingId(null);
                  setError(null);
                }}
                onSubmit={(values) => handleUpdate(link.id, values)}
              />
            ) : (
              <div
                key={link.id}
                className="rsd-card"
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 14,
                  padding: "12px 18px",
                  opacity: acting === link.id ? 0.5 : 1,
                  transition: "opacity 150ms",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
                  <OrderBtn
                    label={`Move ${link.label} up`}
                    disabled={i === 0 || !!acting}
                    onClick={() => run(link.id, () => moveSidebarLink(link.id, "up"))}
                  >
                    <Icons.ChevronUp width={13} height={13} />
                  </OrderBtn>
                  <OrderBtn
                    label={`Move ${link.label} down`}
                    disabled={i === rows.length - 1 || !!acting}
                    onClick={() => run(link.id, () => moveSidebarLink(link.id, "down"))}
                  >
                    <Icons.ChevronDown width={13} height={13} />
                  </OrderBtn>
                </div>
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                  <span style={{ fontSize: 14, fontWeight: 800 }}>{link.label}</span>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      color: "var(--gw-fg-muted)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {link.url}
                  </a>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--gw-fg-muted)" }}>
                    {link.open_in_new_tab ? "Opens in a new tab" : "Opens in the same tab"}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <IconBtn
                    onClick={() => {
                      setEditingId(link.id);
                      setError(null);
                    }}
                    disabled={!!acting}
                    title="Edit"
                  >
                    <Icons.Pencil width={14} height={14} />
                  </IconBtn>
                  <IconBtn onClick={() => handleDelete(link)} disabled={!!acting} title="Delete" danger>
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

function LinkForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: SidebarLinkInput;
  submitLabel: string;
  onSubmit: (values: SidebarLinkInput) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [openInNewTab, setOpenInNewTab] = useState(initial?.openInNewTab ?? true);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!label.trim() || !url.trim()) return;
    setPending(true);
    await onSubmit({ label: label.trim(), url: url.trim(), openInNewTab });
    setPending(false);
  }

  return (
    <form onSubmit={handleSubmit} className="rsd-card" style={{ gap: 14, padding: "16px 18px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        <Input
          label="Label *"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Schedule"
          maxLength={SIDEBAR_LINK_LABEL_MAX}
          help="The name shown in the sidebar. Keep it short."
          autoFocus
          required
        />
        <Input
          label="Link *"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://schedule.omahalightningbasketball.com/"
          help="A web address, or a portal page like /portal/docs."
          inputMode="url"
          required
        />
      </div>
      <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: "var(--gw-fg)" }}>
        <input type="checkbox" checked={openInNewTab} onChange={(e) => setOpenInNewTab(e.target.checked)} />
        Open in a new browser tab
      </label>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Pill variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          Cancel
        </Pill>
        <Pill variant="accent" size="sm" type="submit" disabled={pending || !label.trim() || !url.trim()}>
          {pending ? "Saving…" : submitLabel}
        </Pill>
      </div>
    </form>
  );
}

function OrderBtn({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
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
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.3 : 1,
        padding: 0,
      }}
    >
      {children}
    </button>
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
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
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
