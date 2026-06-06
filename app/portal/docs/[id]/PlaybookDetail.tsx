"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Icons } from "../../../components/icons";
import { MarkdownEditor } from "../../../components/MarkdownEditor";
import { MarkdownView } from "../../../components/MarkdownView";
import { softDeletePlaybook, updatePlaybook } from "../../../../lib/playbooks/actions";
import {
  LinkedContacts,
  type LinkedContactRow,
  type PickerOption,
} from "../../contacts/_shared/LinkedContacts";

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
                  style={{ color: "var(--rsd-accent)", textDecoration: "none", fontWeight: 700 }}
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
                background: "var(--rsd-accent)",
                color: "var(--rsd-accent-on)",
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
                background: "var(--rsd-accent)",
                color: "var(--rsd-accent-on)",
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
            <select
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
            </select>
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
