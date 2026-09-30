"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MarkdownEditor } from "../../../components/MarkdownEditor";
import { createPlaybook } from "../../../../lib/playbooks/actions";
import { ComboSelect } from "../../../components/ComboSelect";

interface Props {
  categories: { id: string; name: string; chip_class: string }[];
}

export function NewPlaybookForm({ categories }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(categories[0]?.id ?? null);
  const [excerpt, setExcerpt] = useState("");
  const [bodyMd, setBodyMd] = useState("");
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
              background: "var(--rsd-accent-fill)",
              color: "var(--rsd-accent-fill-on)",
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

      <div style={{ marginTop: 16 }}>
        <MarkdownEditor
          value={bodyMd}
          onChange={setBodyMd}
          placeholder="Write the playbook in Markdown — headings (#), lists (-), links, code blocks, tables. Use the toolbar for inline formatting."
        />
      </div>

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
