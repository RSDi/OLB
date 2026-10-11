// Matching a Venmo statement to players (0130). Venmo has no API, so the
// Treasurer downloads the account's statement (CSV) and uploads it on
// Payments; this reads the money that came in and suggests whose it is from
// the player names in the note. Nothing is recorded until they confirm.
// Plain module, pure, safe for client and server.

export interface VenmoPayment {
  id: string;
  date: string; // YYYY-MM-DD
  from: string;
  note: string;
  amount_cents: number;
}

// One CSV line into cells, quotes and all.
function cells(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

// Splits on line breaks outside quotes (a note can hold one).
function lines(text: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (const ch of text.replace(/\r\n?/g, "\n")) {
    if (ch === '"') quoted = !quoted;
    if (ch === "\n" && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

// "+ $1,375.00" → 137500; "- $10.00" → -1000.
export function venmoAmount(s: string): number | null {
  const m = s.replace(/\s/g, "").match(/^([+-])?\$?([\d,]+(?:\.\d{1,2})?)$/);
  if (!m) return null;
  const cents = Math.round(Number(m[2].replace(/,/g, "")) * 100);
  return m[1] === "-" ? -cents : cents;
}

// The payments that came in (positive, completed) from a statement.
// Statements start with a few lines about the account; the table starts at
// the row naming its columns.
export function parseVenmoCsv(text: string): { payments: VenmoPayment[]; error?: string } {
  const rows = lines(text).map(cells);
  const headAt = rows.findIndex((r) => r.some((c) => /^id$/i.test(c)) && r.some((c) => /^amount/i.test(c)));
  if (headAt < 0) return { payments: [], error: "That doesn't look like a Venmo statement. Download it from Venmo as a CSV and try again." };
  const head = rows[headAt].map((c) => c.toLowerCase());
  const col = (...names: string[]) => head.findIndex((h) => names.some((n) => h === n || h.startsWith(n)));
  const at = { id: col("id"), date: col("datetime", "date"), type: col("type"), status: col("status"), note: col("note"), from: col("from"), amount: col("amount (total)", "amount") };
  if (at.id < 0 || at.amount < 0) return { payments: [], error: "That statement is missing its ID or Amount column." };
  const payments: VenmoPayment[] = [];
  for (const r of rows.slice(headAt + 1)) {
    const id = r[at.id]?.replace(/^"|"$/g, "");
    if (!id) continue;
    const amount = venmoAmount(r[at.amount] ?? "");
    if (amount == null || amount <= 0) continue;
    if (at.status >= 0 && r[at.status] && !/complete/i.test(r[at.status])) continue;
    if (at.type >= 0 && r[at.type] && /transfer|standard transfer/i.test(r[at.type])) continue;
    const date = (r[at.date] ?? "").slice(0, 10);
    payments.push({
      id,
      date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "",
      from: at.from >= 0 ? r[at.from] ?? "" : "",
      note: at.note >= 0 ? r[at.note] ?? "" : "",
      amount_cents: amount,
    });
  }
  return { payments };
}

export interface MatchPlayer {
  id: string;
  full_name: string;
}

const words = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z']+/)
    .filter(Boolean);

// The players a payment is for: every player whose first and last name are
// in the note, or whose first name is in the note and whose last name is
// the sender's. Siblings named together all match. Empty when it can't tell.
export function matchPlayers(p: Pick<VenmoPayment, "note" | "from">, players: MatchPlayer[]): string[] {
  const note = new Set(words(p.note));
  const fromLast = words(p.from).at(-1) ?? "";
  // "Brooks boys": a last name alone matches every player with it, when the
  // sender shares it.
  const out: string[] = [];
  for (const pl of players) {
    const parts = words(pl.full_name);
    if (parts.length < 2) continue;
    const first = parts[0];
    const last = parts[parts.length - 1];
    if ((note.has(first) && note.has(last)) || (note.has(first) && last === fromLast)) out.push(pl.id);
  }
  if (out.length === 0 && fromLast) {
    const family = players.filter((pl) => words(pl.full_name).at(-1) === fromLast);
    if (family.length > 0 && note.has(fromLast)) return family.map((pl) => pl.id);
  }
  return out;
}

// The payment's reference on Payments, holding the Venmo ID so it isn't
// recorded twice.
export function venmoReference(p: Pick<VenmoPayment, "id" | "note">): string {
  return `Venmo ${p.id}${p.note ? `: ${p.note}` : ""}`.slice(0, 80);
}

export function alreadyRecorded(p: Pick<VenmoPayment, "id">, references: (string | null)[]): boolean {
  const tag = `Venmo ${p.id}`;
  return references.some((r) => !!r && (r === tag || r.startsWith(`${tag}:`)));
}
