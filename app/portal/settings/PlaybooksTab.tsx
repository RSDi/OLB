"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Icons } from "../../components/icons";
import { Input, Pill, Select } from "../../components/ui";
import { ShowMeHow } from "../../components/ShowMeHow";
import { createClient } from "../../../lib/supabase/client";
import {
  createPlaybookCategory,
  softDeletePlaybookCategory,
  updatePlaybookCategory,
} from "../../../lib/playbooks/category-actions";
import { softDeletePlaybook } from "../../../lib/playbooks/actions";
import { isSuperAdmin, type MemberLike } from "../../../lib/auth/permissions";

interface PlaybookCategory {
  id: string;
  name: string;
  chip_class: string;
  sort_order: number;
}

interface PlaybookSummary {
  id: string;
  title: string;
  updated_at: string;
  category: { name: string; chip_class: string } | null;
}

const CHIP_OPTIONS: { value: string; label: string }[] = [
  { value: "rsd-chip-accent", label: "Rose (accent)" },
  { value: "rsd-chip-success", label: "Green (positive)" },
  { value: "rsd-chip-warn", label: "Amber (warn)" },
  { value: "rsd-chip-error", label: "Red (urgent)" },
  { value: "rsd-chip-mute", label: "Gray (neutral)" },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function PlaybooksTab({ me }: { me: MemberLike }) {
  const [cats, setCats] = useState<PlaybookCategory[]>([]);
  const [docs, setDocs] = useState<PlaybookSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canDelete = isSuperAdmin(me);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [{ data: catRows, error: catErr }, { data: docRows, error: docErr }] =
      await Promise.all([
        supabase
          .from("playbook_categories")
          .select("id, name, chip_class, sort_order")
          .is("deleted_at", null)
          .order("sort_order")
          .order("name"),
        supabase
          .from("playbooks")
          .select(
            "id, title, updated_at, category:playbook_categories(name, chip_class)"
          )
          .is("deleted_at", null)
          .order("updated_at", { ascending: false }),
      ]);
    if (catErr) setError(catErr.message);
    else setCats((catRows as PlaybookCategory[]) ?? []);
    if (docErr) setError(docErr.message);
    else setDocs(((docRows as unknown) as PlaybookSummary[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAdd(values: CategoryFormValues) {
    setError(null);
    const res = await createPlaybookCategory({
      name: values.name,
      chipClass: values.chipClass,
      sortOrder: values.sortOrder,
    });
    if (res.error) {
      setError(res.error);
      return;
    }
    setAdding(false);
    await load();
  }

  async function handleUpdateCat(id: string, values: CategoryFormValues) {
    setError(null);
    setActing(id);
    const res = await updatePlaybookCategory(id, {
      name: values.name,
      chipClass: values.chipClass,
      sortOrder: values.sortOrder,
    });
    if (res.error) {
      setError(res.error);
      setActing(null);
      return;
    }
    setEditingId(null);
    await load();
    setActing(null);
  }

  async function handleDeleteCat(id: string, name: string) {
    if (
      !confirm(
        `Move "${name}" to the deleted bin? Playbooks using it lose their category (they aren't deleted).`
      )
    ) {
      return;
    }
    setError(null);
    setActing(id);
    const res = await softDeletePlaybookCategory(id);
    if (res.error) setError(res.error);
    else await load();
    setActing(null);
  }

  async function handleDeleteDoc(id: string, title: string) {
    if (!confirm(`Delete "${title}"? It can be restored from Settings → Deleted.`)) {
      return;
    }
    setError(null);
    setActing(id);
    const res = await softDeletePlaybook(id);
    if (res.error) setError(res.error);
    else await load();
    setActing(null);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
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

      {/* ----- Categories ----- */}
      <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Categories</h3>
            <div
              style={{
                fontSize: 13,
                color: "var(--gw-fg-muted)",
                fontWeight: 500,
                marginTop: 4,
              }}
            >
              Drive the chip color and grouping on the playbooks list.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <ShowMeHow tour="settings-playbooks" />
            {!adding && (
              <span data-tour="playbook-categories-add" style={{ display: "inline-flex" }}>
                <Pill variant="accent" size="sm" onClick={() => setAdding(true)}>
                  <Icons.Plus width={14} height={14} /> Add category
                </Pill>
              </span>
            )}
          </div>
        </div>

        {adding && (
          <CategoryForm
            submitLabel="Add category"
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
        ) : cats.length === 0 ? (
          <div className="rsd-card" style={{ textAlign: "center", padding: "40px 24px" }}>
            <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
              No categories yet.
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {cats.map((c) =>
              editingId === c.id ? (
                <CategoryForm
                  key={c.id}
                  initial={{ name: c.name, chipClass: c.chip_class, sortOrder: c.sort_order }}
                  submitLabel="Save"
                  onCancel={() => {
                    setEditingId(null);
                    setError(null);
                  }}
                  onSubmit={(values) => handleUpdateCat(c.id, values)}
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
                  onDelete={() => handleDeleteCat(c.id, c.name)}
                />
              )
            )}
          </div>
        )}
      </section>

      {/* ----- Playbooks list ----- */}
      <section data-tour="playbooks-all" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Playbooks</h3>
          <div
            style={{
              fontSize: 13,
              color: "var(--gw-fg-muted)",
              fontWeight: 500,
              marginTop: 4,
            }}
          >
            Quick view of every active playbook. Click a row to open and edit its content.
          </div>
        </div>

        {loading ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: "var(--gw-fg-muted)", fontSize: 13 }}>
            Loading…
          </div>
        ) : docs.length === 0 ? (
          <div className="rsd-card" style={{ textAlign: "center", padding: "40px 24px" }}>
            <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
              No playbooks yet.
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {docs.map((d) => {
              const chip = d.category?.chip_class ?? "rsd-chip-mute";
              return (
                <div
                  key={d.id}
                  className="rsd-card"
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 14,
                    padding: "12px 18px",
                    opacity: acting === d.id ? 0.5 : 1,
                    transition: "opacity 150ms",
                  }}
                >
                  <Link
                    href={`/portal/docs/${d.id}`}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      color: "inherit",
                      textDecoration: "none",
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 14, color: "var(--gw-fg)" }}>
                      {d.title}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
                      Updated {formatDate(d.updated_at)}
                    </div>
                  </Link>
                  <span className={`rsd-chip ${chip}`}>
                    {d.category?.name ?? "Uncategorized"}
                  </span>
                  {canDelete && (
                    <IconBtn
                      onClick={() => handleDeleteDoc(d.id, d.title)}
                      disabled={acting === d.id}
                      title="Delete"
                      danger
                    >
                      <Icons.Trash width={14} height={14} />
                    </IconBtn>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
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
  category: PlaybookCategory;
  acting: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      data-tour="playbook-categories-row"
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
      <span className={`rsd-chip ${category.chip_class}`}>{category.name}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
          Sort order: {category.sort_order}
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
  chipClass: string;
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
  const start: CategoryFormValues =
    initial ?? { name: "", chipClass: "rsd-chip-accent", sortOrder: 100 };
  const [name, setName] = useState(start.name);
  const [chipClass, setChipClass] = useState(start.chipClass);
  const [sortOrder, setSortOrder] = useState(String(start.sortOrder));
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return;
    setPending(true);
    await onSubmit({
      name: name.trim(),
      chipClass,
      sortOrder: Number(sortOrder) || 100,
    });
    setPending(false);
  }

  return (
    <form onSubmit={handleSubmit} data-tour="playbook-categories-form" className="rsd-card" style={{ gap: 14, padding: "16px 18px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
        <Input
          label="Name *"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Onboarding"
          autoFocus
          required
        />
        <Input
          label="Sort order"
          type="number"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
        />
      </div>
      <Select
        label="Chip color"
        value={chipClass}
        onChange={(e) => setChipClass(e.target.value)}
      >
        {CHIP_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span className={`rsd-chip ${chipClass}`}>{name || "Preview"}</span>
        <div data-tour="playbook-categories-save" style={{ display: "flex", gap: 8 }}>
          <Pill variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
            Cancel
          </Pill>
          <Pill
            variant="accent"
            size="sm"
            type="submit"
            disabled={pending || !name.trim()}
          >
            {pending ? "Saving…" : submitLabel}
          </Pill>
        </div>
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
