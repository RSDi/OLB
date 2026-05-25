"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { createPlaybook } from "../../../../lib/playbooks/actions";

interface Props {
  categories: { id: string; name: string; chip_class: string }[];
}

export function NewPlaybookForm({ categories }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(categories[0]?.id ?? null);
  const [excerpt, setExcerpt] = useState("");
  const [bodyMd, setBodyMd] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await createPlaybook({
        title,
        categoryId,
        excerpt: excerpt.trim() || null,
        bodyMd,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      if (res.playbookId) {
        router.push(`/portal/docs/${res.playbookId}`);
      } else {
        router.push("/portal/docs");
      }
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
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <Link
            href="/portal/docs"
            style={{
              display: "inline-flex",
              alignItems: "center",
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
            Cancel
          </Link>
          <button
            type="button"
            onClick={submit}
            disabled={pending || !title.trim()}
            style={{
              display: "inline-flex",
              alignItems: "center",
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
            {pending ? "Creating…" : "Create"}
          </button>
        </div>
      </div>

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

      <div style={{ marginTop: 16, display: "flex", gap: 4 }}>
        <button
          type="button"
          onClick={() => setShowPreview(false)}
          style={{
            padding: "6px 14px",
            borderRadius: 8,
            background: !showPreview ? "var(--gw-bg-elev)" : "transparent",
            border: "1px solid",
            borderColor: !showPreview ? "var(--gw-border)" : "transparent",
            fontSize: 12,
            fontWeight: 700,
            color: !showPreview ? "var(--gw-fg)" : "var(--gw-fg-muted)",
            cursor: "pointer",
          }}
        >
          Write
        </button>
        <button
          type="button"
          onClick={() => setShowPreview(true)}
          style={{
            padding: "6px 14px",
            borderRadius: 8,
            background: showPreview ? "var(--gw-bg-elev)" : "transparent",
            border: "1px solid",
            borderColor: showPreview ? "var(--gw-border)" : "transparent",
            fontSize: 12,
            fontWeight: 700,
            color: showPreview ? "var(--gw-fg)" : "var(--gw-fg-muted)",
            cursor: "pointer",
          }}
        >
          Preview
        </button>
      </div>

      {!showPreview ? (
        <textarea
          value={bodyMd}
          onChange={(e) => setBodyMd(e.target.value)}
          placeholder="Write the playbook in Markdown — headings (#), lists (-), links, code blocks, tables, etc."
          rows={20}
          style={{
            width: "100%",
            marginTop: 8,
            padding: "16px 18px",
            background: "var(--gw-bg-elev)",
            color: "var(--gw-fg)",
            border: "1px solid var(--gw-border)",
            borderRadius: 12,
            fontSize: 13,
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            lineHeight: 1.6,
            resize: "vertical",
            outline: "none",
          }}
        />
      ) : (
        <article
          className="rsd-markdown"
          style={{
            marginTop: 8,
            padding: "24px 28px",
            background: "var(--gw-bg-elev)",
            border: "1px solid var(--gw-border)",
            borderRadius: 12,
            fontSize: 14,
            lineHeight: 1.7,
            color: "var(--gw-fg)",
          }}
        >
          {bodyMd.trim() ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{bodyMd}</ReactMarkdown>
          ) : (
            <p style={{ margin: 0, color: "var(--gw-fg-muted)", fontStyle: "italic" }}>
              Nothing to preview yet.
            </p>
          )}
        </article>
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
    </>
  );
}
