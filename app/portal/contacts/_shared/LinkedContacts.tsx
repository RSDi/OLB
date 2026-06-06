"use client";
// Reusable widget shown on the detail pages of any entity that can have
// contacts attached: maintenance tickets, PM assets, playbooks. Renders the
// current set of linked contacts, plus an "Attach" picker for staff to add
// more. Staff can also remove a link with one click.
//
// Network calls use the server actions in lib/contacts/actions.ts; on
// success the parent server component is re-fetched via router.refresh().

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icons } from "../../../components/icons";
import { Pill, Input, Select } from "../../../components/ui";
import {
  linkContactToEntity,
  unlinkContactFromEntity,
  type ContactLinkEntityType,
} from "../../../../lib/contacts/actions";
import { composeSubtitle } from "./format";

export interface LinkedContactRow {
  linkId: string;
  contactId: string;
  contactName: string;
  contactKind: "company" | "person";
  parentName: string | null;
  categoryName: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
}

export interface PickerOption {
  id: string;
  name: string;
  kind: "company" | "person";
  parentName: string | null;
  categoryName: string | null;
}

interface Props {
  entityType: ContactLinkEntityType;
  entityId: string;
  links: LinkedContactRow[];
  allContacts: PickerOption[];
  canEdit: boolean;
}

export function LinkedContacts({
  entityType,
  entityId,
  links,
  allContacts,
  canEdit,
}: Props) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleUnlink(linkId: string, name: string) {
    if (!confirm(`Remove "${name}" from this ${entityLabel(entityType)}?`)) return;
    setActing(linkId);
    setError(null);
    const result = await unlinkContactFromEntity({ linkId });
    setActing(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function handleAdd(contactId: string, role: string) {
    setError(null);
    setActing("add");
    const result = await linkContactToEntity({
      contactId,
      entityType,
      entityId,
      role: role.trim() || null,
    });
    setActing(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    setAdding(false);
    router.refresh();
  }

  // Already-linked ids should be excluded from the picker.
  const linkedIds = new Set(links.map((l) => l.contactId));
  const available = allContacts.filter((c) => !linkedIds.has(c.id));

  return (
    <div className="rsd-card" style={{ gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3
          style={{
            margin: 0,
            fontSize: 13,
            fontWeight: 700,
            color: "var(--gw-fg-muted)",
            textTransform: "uppercase",
            letterSpacing: ".04em",
          }}
        >
          Contacts ({links.length})
        </h3>
        {canEdit && !adding && (
          <Pill variant="ghost" size="sm" onClick={() => setAdding(true)}>
            <Icons.Plus width={12} height={12} /> Attach
          </Pill>
        )}
      </div>

      {error && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "var(--gw-error-bg)",
            border: "1px solid rgba(229,62,62,.25)",
            borderRadius: 8,
            padding: "8px 12px",
            fontSize: 12,
            color: "var(--gw-error)",
            fontWeight: 600,
          }}
        >
          <Icons.AlertCircle width={14} height={14} />
          {error}
        </div>
      )}

      {adding && (
        <AddForm
          options={available}
          onCancel={() => {
            setAdding(false);
            setError(null);
          }}
          onSubmit={handleAdd}
          pending={acting === "add"}
        />
      )}

      {links.length === 0 ? (
        <div
          style={{
            fontSize: 12,
            color: "var(--gw-fg-muted)",
            fontWeight: 500,
            padding: "4px 0",
          }}
        >
          No contacts attached.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {links.map((l) => (
            <div
              key={l.linkId}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 10px",
                borderRadius: 8,
                background: "var(--gw-bg)",
                border: "1px solid var(--gw-border)",
                opacity: acting === l.linkId ? 0.5 : 1,
                transition: "opacity 150ms",
              }}
            >
              <span
                style={{
                  color: "var(--gw-fg-muted)",
                  display: "inline-flex",
                }}
              >
                {l.contactKind === "company" ? (
                  <Icons.Home width={14} height={14} />
                ) : (
                  <Icons.User width={14} height={14} />
                )}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <Link
                    href={`/portal/contacts/${l.contactId}`}
                    style={{ fontSize: 13, fontWeight: 700, color: "var(--gw-fg)", textDecoration: "none" }}
                  >
                    {l.contactName}
                  </Link>
                  {l.role && (
                    <span className="rsd-chip rsd-chip-mute" style={{ fontSize: 10 }}>
                      {l.role}
                    </span>
                  )}
                </div>
                {(() => {
                  const sub = composeSubtitle([
                    l.categoryName,
                    l.parentName,
                    l.email,
                    l.phone,
                  ]);
                  return sub ? (
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--gw-fg-muted)",
                        fontWeight: 500,
                        marginTop: 1,
                      }}
                    >
                      {sub}
                    </div>
                  ) : null;
                })()}
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => handleUnlink(l.linkId, l.contactName)}
                  disabled={acting === l.linkId}
                  title="Remove"
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 6,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "transparent",
                    border: "1px solid var(--gw-border)",
                    color: "var(--gw-fg-muted)",
                    cursor: "pointer",
                  }}
                >
                  <Icons.X width={12} height={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function entityLabel(entityType: ContactLinkEntityType): string {
  if (entityType === "maintenance_ticket") return "ticket";
  if (entityType === "pm_asset") return "asset";
  return "playbook";
}

function AddForm({
  options,
  pending,
  onSubmit,
  onCancel,
}: {
  options: PickerOption[];
  pending: boolean;
  onSubmit: (contactId: string, role: string) => void;
  onCancel: () => void;
}) {
  const [contactId, setContactId] = useState("");
  const [role, setRole] = useState("");
  const [query, setQuery] = useState("");

  const filtered = (() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => {
      const hay = [o.name, o.parentName ?? "", o.categoryName ?? ""].join(" ").toLowerCase();
      return hay.includes(q);
    });
  })();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: 12,
        borderRadius: 8,
        background: "var(--gw-bg-elev)",
        border: "1px solid var(--gw-border)",
      }}
    >
      <Input
        label="Filter"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search contacts…"
        autoFocus
      />
      <Select
        label="Contact"
        value={contactId}
        onChange={(e) => setContactId(e.target.value)}
      >
        <option value="">— Select a contact —</option>
        {filtered.map((o) => (
          <option key={o.id} value={o.id}>
            {o.kind === "company" ? "🏢 " : "👤 "}
            {o.name}
            {o.parentName ? ` (${o.parentName})` : ""}
            {o.categoryName ? ` — ${o.categoryName}` : ""}
          </option>
        ))}
      </Select>
      <Input
        label="Role (optional)"
        value={role}
        onChange={(e) => setRole(e.target.value)}
        placeholder="supplier, installer, quote_only…"
      />
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <Pill variant="ghost" size="sm" onClick={onCancel} disabled={pending}>
          Cancel
        </Pill>
        <Pill
          variant="accent"
          size="sm"
          onClick={() => {
            if (!contactId) return;
            onSubmit(contactId, role);
          }}
          disabled={pending || !contactId}
        >
          {pending ? "Attaching…" : "Attach"}
        </Pill>
      </div>
      {options.length === 0 && (
        <div style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
          No contacts available. Create one first.
        </div>
      )}
    </div>
  );
}
