// Who registered: parent/guardian name, email and phone, for the
// Directory → Registrations card. Player-registration stores both parents
// on extra; assessment and waitlist forms store one parent on the row.

export type RegisteringContact = {
  role: string;
  name: string;
  email: string | null;
  phone: string | null;
};

type ParentBits = {
  first?: string | null;
  last?: string | null;
  email?: string | null;
  phone?: string | null;
};

function blank(s?: string | null): string | null {
  const v = (s ?? "").trim();
  if (!v || /^n\/?a$/i.test(v)) return null;
  return v;
}

function parentName(first?: string | null, last?: string | null): string | null {
  const n = [first, last]
    .map((s) => s?.trim())
    .filter((s): s is string => !!s && !/^n\/?a$/i.test(s))
    .join(" ");
  return n || null;
}

function fromParent(role: string, p?: ParentBits | null): RegisteringContact | null {
  if (!p) return null;
  const name = parentName(p.first, p.last);
  const email = blank(p.email);
  const phone = blank(p.phone);
  if (!name && !email && !phone) return null;
  return { role, name: name ?? role, email, phone };
}

export function registeringContacts(reg: {
  parent_name?: string | null;
  parent_email?: string | null;
  parent_phone?: string | null;
  extra?: { father?: ParentBits | null; mother?: ParentBits | null } | null;
}): RegisteringContact[] {
  const x = reg.extra ?? {};
  const out = [fromParent("Father", x.father), fromParent("Mother", x.mother)].filter(
    (c): c is RegisteringContact => c !== null,
  );
  if (out.length) return out;
  const name = blank(reg.parent_name);
  const email = blank(reg.parent_email);
  const phone = blank(reg.parent_phone);
  if (!name && !email && !phone) return [];
  return [{ role: "Parent / guardian", name: name ?? "Parent / guardian", email, phone }];
}
