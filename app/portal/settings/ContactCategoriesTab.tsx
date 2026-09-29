"use client";
// Settings tab for managing the contact_categories list. Mirrors
// EventCategoriesTab — same add/edit/soft-delete shape, minus the chip
// color (contact categories don't drive chip styling, just grouping).

import { useState, useEffect, useCallback } from "react";
import { Icons } from "../../components/icons";
import { Input, Pill } from "../../components/ui";
import { createClient } from "../../../lib/supabase/client";
import {
  createContactCategory,
  updateContactCategory,
  softDeleteContactCategory,
} from "../../../lib/contacts/category-actions";
import type { MemberLike } from "../../../lib/auth/permissions";
import { isSuperAdmin } from "../../../lib/auth/permissions";

interface ContactCategory {
  id: string;
  name: string;
  slug: string | null;
  sort_order: number;
}

export function ContactCategoriesTab({ me }: { me: MemberLike }) {
  const [rows, setRows] = useState<ContactCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canDelete = isSuperAdmin(me);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error: loadError } = await supabase
      .from("contact_categories")
      .select("id, name, slug, sort_order")
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (loadError) setError(loadError.message);
    else setRows((data as ContactCategory[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAdd(values: CategoryFormValues) {
    setError(null);
    const result = await createContactCategory({
      name: values.name,
      slug: values.slug,
      sortOrder: values.sortOrder,
    });
    if (result.error) {
      setError(result.error);
      return;
    }
    setAdding(false);
    await load();
  }

  async function handleUpdate(id: string, values: CategoryFormValues) {
    setError(null);
    setActing(id);
    const result = await updateContactCategory(id, {
      name: values.name,
      slug: values.slug,
      sortOrder: values.sortOrder,
    });
    if (result.error) {
      setError(result.error);
      setActing(null);
      return;
    }
    setEditingId(null);
    await load();
    setActing(null);
  }

  async function handleDelete(id: string, name: string) {
    if (
      !confirm(
        `Move "${name}" to the deleted bin? Contacts of this type lose their grouping (they aren't deleted).`
      )
    ) {
      return;
    }
    setError(null);
    setActing(id);
    const result = await softDeleteContactCategory(id);
    if (result.error) setError(result.error);
    else await load();
    setActing(null);
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
          Types appear when adding an external contact and as filters on the External Contacts
          page. Use them to group who we work with (uniforms, photos, facilities, opponents, etc.).
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {!adding && (
            <span data-tour="contact-types-add" style={{ display: "inline-flex" }}>
              <Pill variant="accent" size="sm" onClick={() => setAdding(true)}>
                <Icons.Plus width={14} height={14} /> Add type
              </Pill>
            </span>
          )}
        </div>
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
        <CategoryForm
          submitLabel="Add type"
          onCancel={() => {
            setAdding(false);
            setError(null);
          }}
          onSubmit={handleAdd}
        />
      )}

      {loading ? (
        <div
          style={{
            padding: "40px 0",
            textAlign: "center",
            color: "var(--gw-fg-muted)",
            fontSize: 13,
          }}
        >
          Loading…
        </div>
      ) : rows.length === 0 ? (
        <div className="rsd-card" style={{ textAlign: "center", padding: "40px 24px" }}>
          <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
            No contact types yet.
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map((c) =>
            editingId === c.id ? (
              <CategoryForm
                key={c.id}
                initial={{ name: c.name, slug: c.slug ?? "", sortOrder: c.sort_order }}
                submitLabel="Save"
                onCancel={() => {
                  setEditingId(null);
                  setError(null);
                }}
                onSubmit={(values) => handleUpdate(c.id, values)}
              />
            ) : (
              <CategoryRow
                key={c.id}
                category={c}
                acting={acting === c.id}
                canDelete={canDelete}
                onEdit={() => {
                  setEditingId(c.id);
                  setError(null);
                }}
                onDelete={() => handleDelete(c.id, c.name)}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}

function CategoryRow({
  category,
  acting,
  canDelete,
  onEdit,
  onDelete,
}: {
  category: ContactCategory;
  acting: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      data-tour="contact-types-row"
      className="rsd-card"
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        padding: "12px 18px",
        opacity: acting ? 0.5 : 1,
        transition: "opacity 150ms",
      }}
    >
      <span className="rsd-chip rsd-chip-mute">{category.name}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
          {category.slug ? `Slug: ${category.slug} · ` : ""}Sort order: {category.sort_order}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        <IconBtn onClick={onEdit} disabled={acting} title="Edit">
          <Icons.Pencil width={14} height={14} />
        </IconBtn>
        {canDelete && (
          <IconBtn onClick={onDelete} disabled={acting} title="Delete" danger>
            <Icons.Trash width={14} height={14} />
          </IconBtn>
        )}
      </div>
    </div>
  );
}

interface CategoryFormValues {
  name: string;
  slug: string;
  sortOrder: number;
}

function CategoryForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: CategoryFormValues;
  submitLabel: string;
  onSubmit: (values: CategoryFormValues) => void | Promise<void>;
  onCancel: () => void;
}) {
  const start: CategoryFormValues = initial ?? { name: "", slug: "", sortOrder: 100 };
  const [name, setName] = useState(start.name);
  const [slug, setSlug] = useState(start.slug);
  const [sortOrder, setSortOrder] = useState(String(start.sortOrder));
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return;
    setPending(true);
    await onSubmit({
      name: name.trim(),
      slug: slug.trim(),
      sortOrder: Number(sortOrder) || 100,
    });
    setPending(false);
  }

  return (
    <form data-tour="contact-types-form" onSubmit={handleSubmit} className="rsd-card" style={{ gap: 14, padding: "16px 18px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12 }}>
        <Input
          label="Name *"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Plumbing"
          autoFocus
          required
        />
        <Input
          label="Slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="auto from name"
        />
        <Input
          label="Sort order"
          type="number"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
        />
      </div>
      <div data-tour="contact-types-save" style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Pill variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          Cancel
        </Pill>
        <Pill variant="accent" size="sm" type="submit" disabled={pending || !name.trim()}>
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
