"use client";
// Read-only detail view for a single contact, with edit / delete actions in
// the side column. Layout mirrors the maintenance ticket detail: main column
// has the meat (identity, contact info, account, notes), side column has
// metadata + actions.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icons } from "../../../components/icons";
import { Pill } from "../../../components/ui";
import { softDeleteContact } from "../../../../lib/contacts/actions";
import type {
  Contact,
  ContactWithRefs,
  ResolvedLink,
} from "../_shared/data";
import { externalHref, telHref } from "../_shared/format";

interface Props {
  contact: ContactWithRefs;
  people: Contact[];
  links: ResolvedLink[];
  canDelete: boolean;
}

export function ContactDetail({ contact, people, links, canDelete }: Props) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (
      !confirm(
        `Move "${contact.name}" to the deleted bin? Linked tickets, assets, and playbooks keep their reference but it'll be marked deleted in the contacts list.`
      )
    ) {
      return;
    }
    setDeleting(true);
    const result = await softDeleteContact(contact.id);
    setDeleting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.push("/portal/contacts");
    router.refresh();
  }

  const linksByType = groupLinks(links);
  const isCompany = contact.kind === "company";

  return (
    <>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
          <KindBadge isCompany={isCompany} large />
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-.02em" }}>
              {contact.name}
            </h2>
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
              {contact.category && (
                <span className="rsd-chip rsd-chip-mute">{contact.category.name}</span>
              )}
              {contact.parent && (
                <Link
                  href={`/portal/contacts/${contact.parent.id}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 12,
                    fontWeight: 700,
                    color: "var(--gw-fg-muted)",
                    textDecoration: "none",
                  }}
                >
                  at {contact.parent.name}
                  <Icons.ArrowRight width={11} height={11} />
                </Link>
              )}
              {contact.tags?.map((t) => (
                <span key={t} className="rsd-chip rsd-chip-accent" style={{ fontSize: 10 }}>
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
        <Link
          href="/portal/contacts"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 16px",
            borderRadius: 100,
            background: "var(--gw-bg-elev)",
            color: "var(--gw-fg)",
            border: "1px solid var(--gw-border)",
            fontSize: 13,
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          <Icons.ChevronLeft width={14} height={14} />
          Back to contacts
        </Link>
      </div>

      <div
        className="gw-detail-grid"
      >
        {/* Main column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Contact info */}
          <div className="rsd-card" style={{ gap: 14 }}>
            <h3 style={SECTION_TITLE}>Contact info</h3>
            <div style={GRID_2}>
              <ContactRow
                icon={<Icons.Mail width={14} height={14} />}
                label="Email"
                value={contact.email}
                href={contact.email ? `mailto:${contact.email}` : null}
              />
              <ContactRow
                icon={<Icons.Phone width={14} height={14} />}
                label="Phone"
                value={contact.phone}
                href={telHref(contact.phone)}
              />
              <ContactRow
                icon={<Icons.Phone width={14} height={14} />}
                label="Mobile / direct"
                value={contact.mobile_phone}
                href={telHref(contact.mobile_phone)}
              />
              <ContactRow
                icon={<Icons.ArrowRight width={14} height={14} />}
                label="Website"
                value={contact.website}
                href={externalHref(contact.website)}
                external
              />
            </div>
            {contact.address && (
              <ContactRow
                icon={<Icons.MapPin width={14} height={14} />}
                label="Address"
                value={contact.address}
                href={null}
                multiline
              />
            )}
          </div>

          {/* Account & billing */}
          {(contact.account_number ||
            contact.customer_id ||
            contact.payment_terms ||
            contact.tax_id) && (
            <div className="rsd-card" style={{ gap: 14 }}>
              <h3 style={SECTION_TITLE}>Account & billing</h3>
              <div style={GRID_2}>
                <Field label="Account number" value={contact.account_number ?? "—"} />
                <Field label="Customer ID" value={contact.customer_id ?? "—"} />
                <Field label="Payment terms" value={contact.payment_terms ?? "—"} />
                <Field label="Tax ID" value={contact.tax_id ?? "—"} />
              </div>
            </div>
          )}

          {/* Notes blocks */}
          <NotesBlock title="General notes" body={contact.notes} />
          <NotesBlock title="How to re-order" body={contact.reorder_notes} />
          <NotesBlock title="Who to call for quotes" body={contact.quote_contact_notes} />

          {/* People at this company */}
          {isCompany && (
            <div className="rsd-card" style={{ gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={SECTION_TITLE}>
                  People at this company ({people.length})
                </h3>
                <Link
                  href={`/portal/contacts/new?kind=person&parent=${contact.id}`}
                  style={{ textDecoration: "none" }}
                >
                  <Pill variant="ghost" size="sm">
                    <Icons.Plus width={12} height={12} /> Add person
                  </Pill>
                </Link>
              </div>
              {people.length === 0 ? (
                <div style={{ fontSize: 13, color: "var(--gw-fg-muted)", fontWeight: 500, padding: "8px 0" }}>
                  No people linked yet. Add a sales rep, account manager, or specific contact.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {people.map((child, i) => (
                    <Link
                      key={child.id}
                      href={`/portal/contacts/${child.id}`}
                      style={{
                        display: "flex",
                        gap: 12,
                        padding: "10px 0",
                        borderBottom: i < people.length - 1 ? "1px solid var(--gw-border)" : "none",
                        textDecoration: "none",
                        color: "inherit",
                        alignItems: "center",
                      }}
                    >
                      <Icons.User width={14} height={14} style={{ color: "var(--gw-fg-muted)" }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{child.name}</div>
                        {(child.email || child.phone) && (
                          <div style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
                            {[child.email, child.phone].filter(Boolean).join(" · ")}
                          </div>
                        )}
                      </div>
                      <Icons.ChevronRight width={12} height={12} />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Linked entities */}
          {links.length > 0 && (
            <div className="rsd-card" style={{ gap: 12 }}>
              <h3 style={SECTION_TITLE}>Used by ({links.length})</h3>
              <LinkSection
                title="Maintenance tickets"
                items={linksByType.maintenance_ticket}
              />
              <LinkSection title="PM assets" items={linksByType.pm_asset} />
              <LinkSection title="Playbooks" items={linksByType.playbook} />
            </div>
          )}
        </div>

        {/* Side column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, position: "sticky", top: 20 }}>
          <div className="rsd-card" style={{ gap: 12 }}>
            <h3 style={SECTION_TITLE}>Actions</h3>
            <Link href={`/portal/contacts/${contact.id}/edit`} style={{ textDecoration: "none" }}>
              <Pill variant="light" size="md" style={{ width: "100%", justifyContent: "center" }}>
                <Icons.Pencil width={14} height={14} /> Edit
              </Pill>
            </Link>
            {canDelete && (
              <Pill
                variant="ghost"
                size="md"
                onClick={handleDelete}
                disabled={deleting}
                style={{
                  width: "100%",
                  justifyContent: "center",
                  color: "var(--gw-error)",
                  borderColor: "rgba(229,62,62,.25)",
                }}
              >
                <Icons.Trash width={14} height={14} />
                {deleting ? "Deleting…" : "Delete"}
              </Pill>
            )}
            {error && (
              <div style={{ fontSize: 12, color: "var(--gw-error)", fontWeight: 600 }}>
                {error}
              </div>
            )}
          </div>

          <div className="rsd-card" style={{ gap: 12 }}>
            <h3 style={SECTION_TITLE}>Meta</h3>
            <Field label="Kind" value={isCompany ? "Company" : "Person"} />
            <Field label="Created" value={formatDate(contact.created_at)} />
            {contact.updated_at !== contact.created_at && (
              <Field label="Updated" value={formatDate(contact.updated_at)} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

const SECTION_TITLE: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
  fontWeight: 700,
  color: "var(--gw-fg-muted)",
  textTransform: "uppercase",
  letterSpacing: ".04em",
};

const GRID_2: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
};

function groupLinks(links: ResolvedLink[]): Record<string, ResolvedLink[]> {
  const out: Record<string, ResolvedLink[]> = {
    maintenance_ticket: [],
    pm_asset: [],
    playbook: [],
  };
  for (const l of links) {
    out[l.entity_type]?.push(l);
  }
  return out;
}

function LinkSection({ title, items }: { title: string; items: ResolvedLink[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "var(--gw-fg-muted)",
          textTransform: "uppercase",
          letterSpacing: ".04em",
        }}
      >
        {title} ({items.length})
      </span>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {items.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 10px",
              borderRadius: 8,
              background: "var(--gw-bg)",
              border: "1px solid var(--gw-border)",
              fontSize: 13,
              color: "var(--gw-fg)",
              textDecoration: "none",
            }}
          >
            <span style={{ flex: 1, minWidth: 0, fontWeight: 600 }}>{item.title}</span>
            {item.role && (
              <span className="rsd-chip rsd-chip-mute" style={{ fontSize: 10 }}>
                {item.role}
              </span>
            )}
            <Icons.ChevronRight width={12} height={12} />
          </Link>
        ))}
      </div>
    </div>
  );
}

function NotesBlock({ title, body }: { title: string; body: string | null }) {
  if (!body || !body.trim()) return null;
  return (
    <div className="rsd-card" style={{ gap: 10 }}>
      <h3 style={SECTION_TITLE}>{title}</h3>
      <div
        style={{
          fontSize: 13,
          color: "var(--gw-fg)",
          lineHeight: 1.6,
          whiteSpace: "pre-wrap",
        }}
      >
        {body}
      </div>
    </div>
  );
}

function ContactRow({
  icon,
  label,
  value,
  href,
  external,
  multiline,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  href: string | null;
  external?: boolean;
  multiline?: boolean;
}) {
  if (!value) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "var(--gw-fg-muted)",
            textTransform: "uppercase",
            letterSpacing: ".04em",
          }}
        >
          {label}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--gw-fg-muted)" }}>—</span>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "var(--gw-fg-muted)",
          textTransform: "uppercase",
          letterSpacing: ".04em",
        }}
      >
        {label}
      </span>
      {href ? (
        <a
          href={href}
          target={external ? "_blank" : undefined}
          rel={external ? "noreferrer noopener" : undefined}
          style={{
            display: "inline-flex",
            alignItems: multiline ? "flex-start" : "center",
            gap: 6,
            fontSize: 13,
            fontWeight: 600,
            color: "var(--rsd-accent)",
            textDecoration: "none",
            whiteSpace: multiline ? "pre-wrap" : "normal",
            wordBreak: "break-word",
          }}
        >
          <span style={{ color: "var(--gw-fg-muted)", flexShrink: 0 }}>{icon}</span>
          {value}
        </a>
      ) : (
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--gw-fg)",
            whiteSpace: multiline ? "pre-wrap" : "normal",
            wordBreak: "break-word",
            display: "inline-flex",
            alignItems: multiline ? "flex-start" : "center",
            gap: 6,
          }}
        >
          <span style={{ color: "var(--gw-fg-muted)", flexShrink: 0 }}>{icon}</span>
          {value}
        </span>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "var(--gw-fg-muted)",
          textTransform: "uppercase",
          letterSpacing: ".04em",
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--gw-fg)" }}>{value}</span>
    </div>
  );
}

function KindBadge({ isCompany, large }: { isCompany: boolean; large?: boolean }) {
  const size = large ? 48 : 36;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 10,
        background: isCompany ? "var(--gw-ink)" : "var(--gw-bg-elev)",
        color: isCompany ? "#fff" : "var(--gw-fg-muted)",
        border: "1px solid",
        borderColor: isCompany ? "var(--gw-ink)" : "var(--gw-border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {isCompany ? (
        <Icons.Home width={large ? 22 : 16} height={large ? 22 : 16} />
      ) : (
        <Icons.User width={large ? 22 : 16} height={large ? 22 : 16} />
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
