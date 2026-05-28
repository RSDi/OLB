"use client";
// Reusable contact create/edit form. Renders all the fields defined in the
// contacts table; the consumer passes either no `initial` (create) or a
// fully-populated `initial` (edit). On submit it calls the matching server
// action; on success the page navigates to the contact detail.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "../../../components/icons";
import { Input, Pill, Select, Textarea } from "../../../components/ui";
import {
  createContact,
  updateContact,
  type ContactInput,
} from "../../../../lib/contacts/actions";
import type { Contact, ContactCategory, ContactKind } from "./data";
import { parseTags, tagsToInput } from "./format";

interface CompanyOption {
  id: string;
  name: string;
}

interface Props {
  categories: ContactCategory[];
  companies: CompanyOption[];
  initial?: Contact | null;
  // When linking a person off a specific company, the parent comes in
  // pre-selected from the URL — disable the kind toggle.
  initialKind?: ContactKind;
  initialParentId?: string | null;
}

export function ContactForm({
  categories,
  companies,
  initial,
  initialKind,
  initialParentId,
}: Props) {
  const router = useRouter();

  const [kind, setKind] = useState<ContactKind>(
    initial?.kind ?? initialKind ?? "company"
  );
  const [parentId, setParentId] = useState<string | null>(
    initial?.parent_contact_id ?? initialParentId ?? null
  );
  const [categoryId, setCategoryId] = useState<string | null>(
    initial?.category_id ?? null
  );

  const [name, setName] = useState(initial?.name ?? "");
  const [nickname, setNickname] = useState(initial?.nickname ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [mobilePhone, setMobilePhone] = useState(initial?.mobile_phone ?? "");
  const [website, setWebsite] = useState(initial?.website ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");

  const [accountNumber, setAccountNumber] = useState(initial?.account_number ?? "");
  const [customerId, setCustomerId] = useState(initial?.customer_id ?? "");
  const [paymentTerms, setPaymentTerms] = useState(initial?.payment_terms ?? "");
  const [taxId, setTaxId] = useState(initial?.tax_id ?? "");

  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [reorderNotes, setReorderNotes] = useState(initial?.reorder_notes ?? "");
  const [quoteNotes, setQuoteNotes] = useState(initial?.quote_contact_notes ?? "");

  const [tagsText, setTagsText] = useState(
    initial?.tags ? tagsToInput(initial.tags) : ""
  );

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setError(null);
    setPending(true);

    const payload: ContactInput = {
      kind,
      parentContactId: kind === "person" ? parentId : null,
      categoryId: categoryId ?? null,
      name: name.trim(),
      nickname,
      email,
      phone,
      mobilePhone,
      website,
      address,
      accountNumber,
      customerId,
      paymentTerms,
      taxId,
      notes,
      reorderNotes,
      quoteContactNotes: quoteNotes,
      tags: parseTags(tagsText),
    };

    const result = initial
      ? await updateContact(initial.id, payload)
      : await createContact(payload);

    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    const id = result.contactId ?? initial?.id;
    if (id) router.push(`/portal/contacts/${id}`);
    else router.push("/portal/contacts");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Kind toggle — companies vs people. */}
      <div className="rsd-card" style={{ gap: 12 }}>
        <h3 style={SECTION_TITLE}>What kind of contact?</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <KindToggle
            label="Company"
            description="A vendor, supplier, or service provider business."
            selected={kind === "company"}
            onClick={() => {
              setKind("company");
              setParentId(null);
            }}
            disabled={Boolean(initial)} // can't change kind on edit
          />
          <KindToggle
            label="Person"
            description="A sales rep, account manager, or individual professional."
            selected={kind === "person"}
            onClick={() => setKind("person")}
            disabled={Boolean(initial)}
          />
        </div>
        {initial && (
          <div style={{ fontSize: 11, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
            Kind can&apos;t be changed after creation — delete and recreate if needed.
          </div>
        )}
      </div>

      <div className="rsd-card" style={{ gap: 14 }}>
        <h3 style={SECTION_TITLE}>Identity</h3>
        <div style={GRID_2}>
          <Input
            label={kind === "company" ? "Company name *" : "Full name *"}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={kind === "company" ? "e.g. ABC Plumbing" : "e.g. Bob Smith"}
            required
            autoFocus
          />
          <Input
            label="Nickname"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="What we usually call them"
          />
        </div>
        <div style={GRID_2}>
          <Select
            label="Category"
            value={categoryId ?? ""}
            onChange={(e) => setCategoryId(e.target.value || null)}
          >
            <option value="">— None —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          {kind === "person" && (
            <Select
              label="Works at (company)"
              value={parentId ?? ""}
              onChange={(e) => setParentId(e.target.value || null)}
            >
              <option value="">— Independent —</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </div>
      </div>

      <div className="rsd-card" style={{ gap: 14 }}>
        <h3 style={SECTION_TITLE}>Contact info</h3>
        <div style={GRID_2}>
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="orders@example.com"
          />
          <Input
            label="Phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(555) 123-4567"
          />
        </div>
        <div style={GRID_2}>
          <Input
            label="Mobile / direct"
            type="tel"
            value={mobilePhone}
            onChange={(e) => setMobilePhone(e.target.value)}
            placeholder="Optional"
          />
          <Input
            label="Website"
            type="url"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="example.com"
          />
        </div>
        <Textarea
          label="Address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          rows={2}
          placeholder="Street, city, state, ZIP"
        />
      </div>

      <div className="rsd-card" style={{ gap: 14 }}>
        <h3 style={SECTION_TITLE}>Account & billing</h3>
        <div style={GRID_2}>
          <Input
            label="Account number"
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            placeholder="Our account # with them"
          />
          <Input
            label="Customer ID"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
          />
        </div>
        <div style={GRID_2}>
          <Input
            label="Payment terms"
            value={paymentTerms}
            onChange={(e) => setPaymentTerms(e.target.value)}
            placeholder="Net 30, COD, etc."
          />
          <Input
            label="Tax ID"
            value={taxId}
            onChange={(e) => setTaxId(e.target.value)}
          />
        </div>
      </div>

      <div className="rsd-card" style={{ gap: 14 }}>
        <h3 style={SECTION_TITLE}>Notes</h3>
        <Textarea
          label="General notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Anything else worth knowing about this contact."
        />
        <Textarea
          label="How to re-order"
          value={reorderNotes}
          onChange={(e) => setReorderNotes(e.target.value)}
          rows={3}
          placeholder="Login URL, account number to reference, minimum quantities, lead time…"
        />
        <Textarea
          label="Who to call for quotes"
          value={quoteNotes}
          onChange={(e) => setQuoteNotes(e.target.value)}
          rows={3}
          placeholder="Best person to ask for a quote, their direct line, hours, response time…"
        />
      </div>

      <div className="rsd-card" style={{ gap: 14 }}>
        <h3 style={SECTION_TITLE}>Tags</h3>
        <Input
          label="Comma-separated"
          value={tagsText}
          onChange={(e) => setTagsText(e.target.value)}
          placeholder="preferred, emergency, after-hours"
        />
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

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Pill
          variant="ghost"
          size="md"
          onClick={() => {
            if (initial) router.push(`/portal/contacts/${initial.id}`);
            else router.push("/portal/contacts");
          }}
          disabled={pending}
        >
          Cancel
        </Pill>
        <Pill variant="accent" size="md" type="submit" disabled={pending}>
          {pending ? "Saving…" : initial ? "Save changes" : "Create contact"}
        </Pill>
      </div>
    </form>
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

function KindToggle({
  label,
  description,
  selected,
  onClick,
  disabled,
}: {
  label: string;
  description: string;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1,
        minWidth: 200,
        textAlign: "left",
        padding: "12px 14px",
        borderRadius: 10,
        border: "2px solid",
        borderColor: selected ? "var(--rsd-accent)" : "var(--gw-border)",
        background: selected ? "var(--gw-rose-bg)" : "var(--gw-bg)",
        color: "var(--gw-fg)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled && !selected ? 0.5 : 1,
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <span style={{ fontWeight: 700, fontSize: 14 }}>{label}</span>
      <span style={{ fontSize: 12, color: "var(--gw-fg-muted)", fontWeight: 500 }}>
        {description}
      </span>
    </button>
  );
}
