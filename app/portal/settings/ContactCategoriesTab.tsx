"use client";
// Settings tab for managing the contact_categories list. Mirrors
// EventCategoriesTab — same add/edit/soft-delete shape, minus the chip
// color (contact categories don't drive chip styling, just grouping).

import { useState, useEffect, useCallback } from "react";
import { Icons } from "../../components/icons";
import { Input, Pill, Select } from "../../components/ui";
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
  // Coaches can read its contacts (0109).
  shared_with_coaches?: boolean;
  // Hotels or places to eat: the travel coordinator keeps them, and the HS
  // Schedule lists them under a weekend away (0110).
  travel_kind?: TravelKind | null;
}

type TravelKind = "hotel" | "food";
const TRAVEL_LABEL: Record<TravelKind, string> = { hotel: "Hotels", food: "Places to eat" };

export function ContactCategoriesTab({ me }: { me: MemberLike }) {
  const [rows, setRows] = useState<ContactCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // "Coaches can see" needs migration 0109, and Travel 0110; until then
  // they aren't offered.
  const [sharing, setSharing] = useState(true);
  const [travelReady, setTravelReady] = useState(true);

  const canDelete = isSuperAdmin(me);

  const load = useCallback(async () => {
    const supabase = createClient();
    const run = (columns: string) =>
      supabase
        .from("contact_categories")
        .select(columns)
        .is("deleted_at", null)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
    let { data, error: loadError } = await run("id, name, slug, sort_order, shared_with_coaches, travel_kind");
    if (loadError && /travel_kind/.test(loadError.message)) {
      setTravelReady(false);
      ({ data, error: loadError } = await run("id, name, slug, sort_order, shared_with_coaches"));
    }
    if (loadError && /shared_with_coaches/.test(loadError.message)) {
      setSharing(false);
      setTravelReady(false);
      ({ data, error: loadError } = await run("id, name, slug, sort_order"));
    }
    if (loadError) setError(loadError.message);
    else setRows((data as unknown as ContactCategory[]) ?? []);
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
      sharedWithCoaches: sharing ? values.shared : undefined,
      travelKind: travelReady ? values.travel : undefined,
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
      sharedWithCoaches: sharing ? values.shared : undefined,
      travelKind: travelReady ? values.travel : undefined,
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
          {sharing && " Coaches can read the contacts of the types marked Coaches can see."}
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
          sharing={sharing}
          travelReady={travelReady}
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
                initial={{
                  name: c.name,
                  slug: c.slug ?? "",
                  sortOrder: c.sort_order,
                  shared: !!c.shared_with_coaches,
                  travel: c.travel_kind ?? null,
                }}
                submitLabel="Save"
                sharing={sharing}
                travelReady={travelReady}
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
      {category.shared_with_coaches && (
        <span className="rsd-chip rsd-chip-accent" style={{ fontSize: 10 }} title="Coaches can read the contacts of this type">
          Coaches can see
        </span>
      )}
      {category.travel_kind && (
        <span
          className="rsd-chip rsd-chip-mute"
          style={{ fontSize: 10 }}
          title="The travel coordinator keeps these, and they show under the HS Schedule's weekends away"
        >
          Travel: {TRAVEL_LABEL[category.travel_kind]}
        </span>
      )}
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
  shared: boolean;
  travel: TravelKind | null;
}

function CategoryForm({
  initial,
  submitLabel,
  sharing,
  travelReady,
  onSubmit,
  onCancel,
}: {
  initial?: CategoryFormValues;
  submitLabel: string;
  // Offer "Coaches can see" (migration 0109 is in).
  sharing: boolean;
  // Offer Travel (migration 0110 is in).
  travelReady: boolean;
  onSubmit: (values: CategoryFormValues) => void | Promise<void>;
  onCancel: () => void;
}) {
  const start: CategoryFormValues = initial ?? { name: "", slug: "", sortOrder: 100, shared: false, travel: null };
  const [name, setName] = useState(start.name);
  const [slug, setSlug] = useState(start.slug);
  const [sortOrder, setSortOrder] = useState(String(start.sortOrder));
  const [shared, setShared] = useState(start.shared);
  const [travel, setTravel] = useState<TravelKind | null>(start.travel);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return;
    setPending(true);
    await onSubmit({
      name: name.trim(),
      slug: slug.trim(),
      sortOrder: Number(sortOrder) || 100,
      shared,
      travel,
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
      {sharing && (
        <label style={{ display: "inline-flex", alignItems: "flex-start", gap: 8, fontSize: 13, fontWeight: 600, lineHeight: 1.5 }}>
          <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} style={{ marginTop: 3 }} />
          <span>
            Coaches can see
            <span style={{ display: "block", fontSize: 12, fontWeight: 500, color: "var(--gw-fg-muted)" }}>
              Coaches can read these contacts, and the people at them, everything on them notes included. They can&apos;t
              change them.
            </span>
          </span>
        </label>
      )}
      {travelReady && (
        <Select
          label="Travel"
          value={travel ?? ""}
          onChange={(e) => setTravel((e.target.value || null) as TravelKind | null)}
          help="Hotels and places to eat show under the HS Schedule's weekends away in their city, and the travel coordinator keeps them."
        >
          <option value="">Not travel</option>
          <option value="hotel">Hotels</option>
          <option value="food">Places to eat</option>
        </Select>
      )}
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
