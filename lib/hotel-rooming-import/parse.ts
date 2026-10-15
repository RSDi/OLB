// Parse hotel group rooming lists (PDF text or CSV) into guest rows.
// Staybridge / IHG-style "Group Rooming List" is the first format; others can
// be added as we see them. Pure module — safe for node --test.

export interface RoomingGuest {
  confirmation: string;
  firstName: string;
  lastName: string;
  checkIn: string;
  checkOut: string;
  roomType: string | null;
  rateCode: string | null;
  rate: number | null;
}

export interface ParsedRoomingList {
  hotelName: string | null;
  groupCode: string | null;
  guests: RoomingGuest[];
  format: "group_rooming_list" | "csv" | "unknown";
  warnings: string[];
}

const DATE = /(\d{4}-\d{2}-\d{2})/;
const ROW =
  /^(\d{6,12})\s+(.+?)\s+(\d{4}-\d{2}-\d{2})\s+(\d{4}-\d{2}-\d{2})\s+(\S+)\s+(\S+)\s+(\d+(?:\.\d+)?)\s*$/;

export function parseRoomingListText(raw: string): ParsedRoomingList {
  const warnings: string[] = [];
  const text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (looksLikeCsv(lines)) {
    return parseCsvRooming(lines, warnings);
  }

  const hotelName = guessHotelName(lines);
  const groupCode = guessGroupCode(lines);
  const guests: RoomingGuest[] = [];

  for (const line of lines) {
    if (/^page\s*\d+/i.test(line)) continue;
    if (/confirmation\s*number/i.test(line) && /first_name|first name/i.test(line)) continue;
    if (/^group room/i.test(line)) continue;
    if (/^report run/i.test(line)) continue;
    if (/^user:/i.test(line)) continue;

    const guest = parseGuestLine(line);
    if (guest) guests.push(guest);
  }

  if (guests.length === 0) {
    warnings.push("Couldn't find guest rows. Paste a Group Rooming List PDF or a CSV with confirmation, name and dates.");
  }

  return {
    hotelName,
    groupCode,
    guests,
    format: guests.length > 0 ? "group_rooming_list" : "unknown",
    warnings,
  };
}

function parseGuestLine(line: string): RoomingGuest | null {
  // Prefer the common Staybridge column order.
  const m = line.match(ROW);
  if (m) {
    const [, confirmation, namePart, checkIn, checkOut, roomType, rateCode, rateStr] = m;
    const { firstName, lastName } = splitPersonName(namePart);
    if (!firstName || !lastName) return null;
    return {
      confirmation,
      firstName,
      lastName,
      checkIn,
      checkOut,
      roomType,
      rateCode,
      rate: Number(rateStr),
    };
  }

  // Fallback: confirmation … date date … at end.
  const conf = line.match(/^(\d{6,12})\s+(.+)$/);
  if (!conf) return null;
  const rest = conf[2];
  const dates = [...rest.matchAll(/(\d{4}-\d{2}-\d{2})/g)].map((x) => x[1]);
  if (dates.length < 2) return null;
  const before = rest.slice(0, rest.indexOf(dates[0])).trim();
  const after = rest.slice(rest.indexOf(dates[1]) + dates[1].length).trim();
  const { firstName, lastName } = splitPersonName(before);
  if (!firstName || !lastName) return null;
  const bits = after.split(/\s+/).filter(Boolean);
  const rateBit = bits.find((b) => /^\d+(\.\d+)?$/.test(b));
  return {
    confirmation: conf[1],
    firstName,
    lastName,
    checkIn: dates[0],
    checkOut: dates[1],
    roomType: bits[0] && !DATE.test(bits[0]) ? bits[0] : null,
    rateCode: bits[1] && !/^\d/.test(bits[1]) ? bits[1] : null,
    rate: rateBit ? Number(rateBit) : null,
  };
}

export function splitPersonName(raw: string): { firstName: string; lastName: string } {
  const cleaned = raw.replace(/\s+/g, " ").trim();
  if (!cleaned) return { firstName: "", lastName: "" };

  // "ANDREWSCOTT WEHRLI" → try to split a glued ALLCAPS first name.
  const parts = cleaned.split(" ");
  if (parts.length === 2 && /^[A-Z]{6,}$/.test(parts[0]) && /^[A-Za-z][A-Za-z'-]+$/.test(parts[1])) {
    const split = splitGluedFirst(parts[0]);
    if (split) return { firstName: titleCase(split), lastName: titleCase(parts[1]) };
  }

  if (parts.length === 1) return { firstName: titleCase(parts[0]), lastName: "" };
  return {
    firstName: titleCase(parts.slice(0, -1).join(" ")),
    lastName: titleCase(parts[parts.length - 1]),
  };
}

// Common two-word first names jammed together in ALL CAPS.
const GLUED_FIRST = [
  "ANDREWSCOTT",
  "MARYANN",
  "MARYANNE",
  "MARYJO",
  "ANNEMARIE",
  "JOANN",
  "JOANNE",
  "JOHNPAUL",
  "JOHNMICHAEL",
];

function splitGluedFirst(token: string): string | null {
  const upper = token.toUpperCase();
  for (const g of GLUED_FIRST) {
    if (upper === g) {
      // ANDREWSCOTT → Andrew Scott
      if (g === "ANDREWSCOTT") return "Andrew Scott";
      if (g.startsWith("MARY")) return `Mary ${titleCase(g.slice(4))}`;
      if (g.startsWith("ANNE")) return `Anne ${titleCase(g.slice(4))}`;
      if (g.startsWith("JO")) return `Jo ${titleCase(g.slice(2))}`;
      if (g.startsWith("JOHN")) return `John ${titleCase(g.slice(4))}`;
    }
  }
  // Heuristic: split before a second capital run if we had mixed case; for
  // ALLCAPS, leave as one token (matching still uses last name).
  return null;
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/([\s'-])/)
    .map((p, i, arr) => {
      if (p === " " || p === "-" || p === "'") return p;
      // Keep Mc / Mac / Van / De prefixes readable.
      if (i > 0 && /^(mc|mac)$/i.test(arr[i - 2] ?? "") && p.length > 1) {
        return p.charAt(0).toUpperCase() + p.slice(1);
      }
      return p.charAt(0).toUpperCase() + p.slice(1);
    })
    .join("");
}

function guessHotelName(lines: string[]): string | null {
  for (const line of lines.slice(0, 8)) {
    if (/group room/i.test(line)) continue;
    if (/report run/i.test(line)) continue;
    if (/^user:/i.test(line)) continue;
    if (/confirmation/i.test(line)) continue;
    // "Staybridge Suites …" or similar brand line.
    if (/suites|inn|hotel|marriott|hilton|hyatt|hampton|residence|holiday|embassy|courtyard|fairfield|springhill|homewood|towneplace|staybridge/i.test(line)) {
      // Strip a trailing group code glued on the same line.
      return line.replace(/\s+[A-Z0-9]{3,8}\s+Report Run Date:.*/i, "").replace(/\s+Report Run Date:.*/i, "").trim() || null;
    }
  }
  // First non-meta line.
  const first = lines.find((l) => !/report run|^user:|group room|confirmation/i.test(l));
  return first ?? null;
}

function guessGroupCode(lines: string[]): string | null {
  for (const line of lines.slice(0, 12)) {
    const alone = line.match(/^([A-Z0-9]{3,8})$/);
    if (alone) return alone[1];
    const glued = line.match(/^([A-Z0-9]{3,8})\s+Report Run Date:/i);
    if (glued) return glued[1];
  }
  return null;
}

function looksLikeCsv(lines: string[]): boolean {
  if (lines.length < 2) return false;
  const head = lines[0].toLowerCase();
  return head.includes(",") && /confirm|first|last|name|check/.test(head);
}

function parseCsvRooming(lines: string[], warnings: string[]): ParsedRoomingList {
  const header = splitCsv(lines[0]).map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const idx = (names: string[]) => header.findIndex((h) => names.includes(h));
  const iConf = idx(["confirmation", "confirmation_number", "conf", "confirmation_#"]);
  const iFirst = idx(["first_name", "firstname", "first"]);
  const iLast = idx(["last_name", "lastname", "last"]);
  const iName = idx(["name", "guest", "guest_name"]);
  const iIn = idx(["check_in", "check_in_date", "checkin", "arrival"]);
  const iOut = idx(["check_out", "check_out_date", "checkout", "departure"]);
  const iRoom = idx(["room_type", "room", "roomtype"]);
  const iCode = idx(["rate_code", "ratecode"]);
  const iRate = idx(["rate", "amount"]);

  const guests: RoomingGuest[] = [];
  for (const line of lines.slice(1)) {
    const cols = splitCsv(line);
    if (cols.every((c) => !c.trim())) continue;
    let firstName = iFirst >= 0 ? cols[iFirst]?.trim() ?? "" : "";
    let lastName = iLast >= 0 ? cols[iLast]?.trim() ?? "" : "";
    if ((!firstName || !lastName) && iName >= 0) {
      const split = splitPersonName(cols[iName] ?? "");
      firstName = firstName || split.firstName;
      lastName = lastName || split.lastName;
    }
    const checkIn = normalizeDate(cols[iIn] ?? "");
    const checkOut = normalizeDate(cols[iOut] ?? "");
    const confirmation = (iConf >= 0 ? cols[iConf] : cols[0])?.trim() ?? "";
    if (!confirmation || !firstName || !lastName || !checkIn || !checkOut) {
      warnings.push(`Skipped a CSV row: ${line.slice(0, 80)}`);
      continue;
    }
    const rateRaw = iRate >= 0 ? cols[iRate]?.replace(/[$,]/g, "") : "";
    guests.push({
      confirmation,
      firstName: titleCase(firstName),
      lastName: titleCase(lastName),
      checkIn,
      checkOut,
      roomType: iRoom >= 0 ? cols[iRoom]?.trim() || null : null,
      rateCode: iCode >= 0 ? cols[iCode]?.trim() || null : null,
      rate: rateRaw && !Number.isNaN(Number(rateRaw)) ? Number(rateRaw) : null,
    });
  }
  return { hotelName: null, groupCode: null, guests, format: "csv", warnings };
}

function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      q = !q;
      continue;
    }
    if (ch === "," && !q) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function normalizeDate(raw: string): string | null {
  const t = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [, mo, d, y] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

export function guestDisplayName(g: Pick<RoomingGuest, "firstName" | "lastName">): string {
  return `${g.firstName} ${g.lastName}`.trim();
}
