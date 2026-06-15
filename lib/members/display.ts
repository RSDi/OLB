// Central member display-name helper (2026-06).
//
// A member's name is a single `full_name` string ("Jeffrey Wayne Malone") plus
// an optional `nickname`. Everywhere EXCEPT the directory we show a short name:
// (nickname || first name) + last name — the middle name is never shown. The
// directory pages keep the full legal name + middle (they use their own
// displayName in app/portal/directory/_shared/format.ts).
//
// first = first whitespace token, last = last token. This nails the common
// "First Middle Last" case; compound surnames (Van Dyke) / suffixes (Jr.) are
// imperfect from a single string — acceptable until names are split into
// columns.

export interface NamedMember {
  full_name: string | null;
  nickname?: string | null;
  email?: string | null;
}

function tokens(full: string): string[] {
  return full.trim().split(/\s+/).filter(Boolean);
}

// Short display name: (nickname || first) + last, middle omitted. Falls back to
// the full name, then email, then "Unknown".
export function memberDisplayName(m: NamedMember | null | undefined): string {
  if (!m) return "Unknown";
  const full = (m.full_name ?? "").trim();
  if (!full) return m.email ?? "Unknown";
  const parts = tokens(full);
  const first = m.nickname?.trim() || parts[0] || full;
  const last = parts.length > 1 ? parts[parts.length - 1] : "";
  return last ? `${first} ${last}` : first;
}

// Just the personal name: nickname || first token. For greetings ("Welcome
// back, Jeff") and couple labels.
export function memberFirstName(m: NamedMember | null | undefined): string {
  if (!m) return "there";
  const full = (m.full_name ?? "").trim();
  const nick = m.nickname?.trim();
  if (nick) return nick;
  if (full) return tokens(full)[0] || full;
  return m.email ?? "there";
}
