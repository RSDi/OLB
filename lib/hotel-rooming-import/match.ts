// Best-guess matching for a parsed rooming list: hotel contact, HS weekend /
// stay, and Directory parents → players. Pure module — safe for node --test.

import { guestDisplayName, type ParsedRoomingList, type RoomingGuest } from "./parse.ts";

export interface MatchHotel {
  id: string;
  name: string;
  city: string | null;
}

export interface MatchWeekend {
  id: string;
  seasonId: string;
  season: number;
  event: string;
  startsOn: string;
  endsOn: string;
  location: string | null;
}

export interface MatchStay {
  id: string;
  weekendId: string;
  hotelContactId: string;
  name: string;
  status: string;
}

export interface MatchPerson {
  // A Directory parent (member) or a player name we can score against.
  kind: "parent" | "player";
  id: string;
  name: string;
  // For parents: their player ids this season.
  playerIds: string[];
  // For players: just themselves.
  teamId: string | null;
}

export interface GuestMatch {
  guest: RoomingGuest;
  displayName: string;
  // Players to mark Booked (empty = unmatched).
  playerIds: string[];
  playerNames: string[];
  confidence: "exact" | "likely" | "weak" | "none";
  reason: string;
  // Other candidates the UI can offer.
  candidates: { playerId: string; playerName: string; label: string }[];
}

export interface RoomingMatchPlan {
  hotel: { pick: MatchHotel | null; candidates: MatchHotel[]; score: number };
  weekend: { pick: MatchWeekend | null; candidates: MatchWeekend[]; score: number };
  stay: { pick: MatchStay | null; candidates: MatchStay[]; willCreate: boolean };
  guests: GuestMatch[];
  checkIn: string | null;
  checkOut: string | null;
}

export function personKey(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function scoreHotelName(query: string, hotel: MatchHotel): number {
  const q = personKey(query);
  const n = personKey(hotel.name);
  if (!q || !n) return 0;
  if (q === n) return 100;
  if (n.includes(q) || q.includes(n)) return 85;
  const qt = new Set(q.split(" ").filter((t) => t.length > 2));
  const nt = n.split(" ").filter((t) => t.length > 2);
  if (qt.size === 0) return 0;
  let hit = 0;
  for (const t of nt) if (qt.has(t)) hit++;
  const overlap = hit / Math.max(qt.size, nt.length);
  // Soft city boost when the query mentions the hotel's city.
  const city = hotel.city ? personKey(hotel.city) : "";
  const cityBonus = city && q.includes(city) ? 10 : 0;
  return Math.round(overlap * 70) + cityBonus;
}

export function pickHotel(query: string | null, hotels: MatchHotel[]): RoomingMatchPlan["hotel"] {
  if (!query) return { pick: null, candidates: hotels.slice(0, 8), score: 0 };
  const ranked = hotels
    .map((h) => ({ h, score: scoreHotelName(query, h) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.h.name.localeCompare(b.h.name));
  const top = ranked[0];
  return {
    pick: top && top.score >= 40 ? top.h : null,
    candidates: (ranked.length ? ranked.map((r) => r.h) : hotels).slice(0, 8),
    score: top?.score ?? 0,
  };
}

export function datesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

export function scoreWeekend(checkIn: string, checkOut: string, w: MatchWeekend): number {
  if (!datesOverlap(checkIn, checkOut, w.startsOn, w.endsOn)) return 0;
  // Exact stay window on the weekend → strong.
  if (checkIn === w.startsOn && checkOut === w.endsOn) return 100;
  if (checkIn >= w.startsOn && checkOut <= w.endsOn) return 90;
  return 70;
}

export function pickWeekend(
  checkIn: string | null,
  checkOut: string | null,
  weekends: MatchWeekend[]
): RoomingMatchPlan["weekend"] {
  if (!checkIn || !checkOut) return { pick: null, candidates: weekends.slice(0, 8), score: 0 };
  const ranked = weekends
    .map((w) => ({ w, score: scoreWeekend(checkIn, checkOut, w) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.w.startsOn.localeCompare(a.w.startsOn));
  const top = ranked[0];
  return {
    pick: top?.w ?? null,
    candidates: (ranked.length ? ranked.map((r) => r.w) : weekends).slice(0, 8),
    score: top?.score ?? 0,
  };
}

export function pickStay(
  weekendId: string | null,
  hotelId: string | null,
  stays: MatchStay[]
): RoomingMatchPlan["stay"] {
  const onWeekend = weekendId ? stays.filter((s) => s.weekendId === weekendId) : stays;
  const exact =
    weekendId && hotelId
      ? onWeekend.find((s) => s.hotelContactId === hotelId) ?? null
      : null;
  const candidates = exact
    ? [exact, ...onWeekend.filter((s) => s.id !== exact.id)]
    : onWeekend;
  return {
    pick: exact ?? (candidates.length === 1 ? candidates[0] : null),
    candidates: candidates.slice(0, 8),
    willCreate: !exact && candidates.length !== 1,
  };
}

export function matchGuest(guest: RoomingGuest, people: MatchPerson[]): GuestMatch {
  const displayName = guestDisplayName(guest);
  const full = personKey(displayName);
  const last = personKey(guest.lastName);
  const first = personKey(guest.firstName);
  const firstToken = first.split(" ")[0] ?? first;

  const candidates: GuestMatch["candidates"] = [];
  const pushPlayer = (playerId: string, playerName: string, label: string) => {
    if (candidates.some((c) => c.playerId === playerId)) return;
    candidates.push({ playerId, playerName, label });
  };

  // 1) Exact parent name → their players.
  const parents = people.filter((p) => p.kind === "parent");
  const players = people.filter((p) => p.kind === "player");
  const exactParent = parents.find((p) => personKey(p.name) === full);
  if (exactParent && exactParent.playerIds.length > 0) {
    for (const id of exactParent.playerIds) {
      const pl = players.find((p) => p.id === id);
      pushPlayer(id, pl?.name ?? "Player", `Parent ${exactParent.name}`);
    }
    return {
      guest,
      displayName,
      playerIds: exactParent.playerIds,
      playerNames: candidates.map((c) => c.playerName),
      confidence: "exact",
      reason: `Matched parent ${exactParent.name}`,
      candidates,
    };
  }

  // 2) Exact player name.
  const exactPlayer = players.find((p) => personKey(p.name) === full);
  if (exactPlayer) {
    pushPlayer(exactPlayer.id, exactPlayer.name, "Player name");
    return {
      guest,
      displayName,
      playerIds: [exactPlayer.id],
      playerNames: [exactPlayer.name],
      confidence: "exact",
      reason: "Matched player name",
      candidates,
    };
  }

  // 3) Parent last name unique + first token matches.
  const parentsLast = parents.filter((p) => personKey(p.name).split(" ").slice(-1)[0] === last);
  const parentsFirst = parentsLast.filter((p) => {
    const pf = personKey(p.name).split(" ")[0] ?? "";
    return pf === firstToken || first.startsWith(pf) || pf.startsWith(firstToken);
  });
  if (parentsFirst.length === 1 && parentsFirst[0].playerIds.length > 0) {
    const p = parentsFirst[0];
    for (const id of p.playerIds) {
      const pl = players.find((x) => x.id === id);
      pushPlayer(id, pl?.name ?? "Player", `Parent ${p.name}`);
    }
    return {
      guest,
      displayName,
      playerIds: p.playerIds,
      playerNames: candidates.map((c) => c.playerName),
      confidence: "likely",
      reason: `Likely parent ${p.name}`,
      candidates,
    };
  }

  // 4) Unique last name among parents (one family).
  if (parentsLast.length === 1 && parentsLast[0].playerIds.length > 0) {
    const p = parentsLast[0];
    for (const id of p.playerIds) {
      const pl = players.find((x) => x.id === id);
      pushPlayer(id, pl?.name ?? "Player", `Parent ${p.name} (last name)`);
    }
    return {
      guest,
      displayName,
      playerIds: p.playerIds,
      playerNames: candidates.map((c) => c.playerName),
      confidence: "weak",
      reason: `Only parent with last name ${guest.lastName}`,
      candidates,
    };
  }

  // 5) Unique player last name.
  const playersLast = players.filter((p) => personKey(p.name).split(" ").slice(-1)[0] === last);
  if (playersLast.length === 1) {
    const p = playersLast[0];
    pushPlayer(p.id, p.name, "Player last name");
    return {
      guest,
      displayName,
      playerIds: [p.id],
      playerNames: [p.name],
      confidence: "weak",
      reason: `Only player with last name ${guest.lastName}`,
      candidates,
    };
  }

  // Offer loose candidates for the UI picker.
  for (const p of parentsFirst.slice(0, 4)) {
    for (const id of p.playerIds) {
      const pl = players.find((x) => x.id === id);
      pushPlayer(id, pl?.name ?? "Player", `Parent ${p.name}`);
    }
  }
  for (const p of playersLast.slice(0, 4)) {
    pushPlayer(p.id, p.name, "Same last name");
  }

  return {
    guest,
    displayName,
    playerIds: [],
    playerNames: [],
    confidence: "none",
    reason: "No Directory match yet",
    candidates,
  };
}

export function buildMatchPlan(
  parsed: ParsedRoomingList,
  hotels: MatchHotel[],
  weekends: MatchWeekend[],
  stays: MatchStay[],
  people: MatchPerson[]
): RoomingMatchPlan {
  const checkIn = parsed.guests[0]?.checkIn ?? null;
  const checkOut = parsed.guests[0]?.checkOut ?? null;
  const hotel = pickHotel(parsed.hotelName, hotels);
  const weekend = pickWeekend(checkIn, checkOut, weekends);
  const stay = pickStay(weekend.pick?.id ?? null, hotel.pick?.id ?? null, stays);

  // Deduplicate guests by confirmation; keep order.
  const seen = new Set<string>();
  const guests: GuestMatch[] = [];
  for (const g of parsed.guests) {
    const key = g.confirmation || `${g.firstName}|${g.lastName}|${g.checkIn}`;
    if (seen.has(key)) continue;
    seen.add(key);
    guests.push(matchGuest(g, people));
  }

  // Same parent booked two rooms: merge player marks, keep both confs in reason.
  const byParent = new Map<string, GuestMatch[]>();
  for (const g of guests) {
    if (g.playerIds.length === 0) continue;
    const k = g.playerIds.slice().sort().join(",");
    const list = byParent.get(k) ?? [];
    list.push(g);
    byParent.set(k, list);
  }
  for (const list of byParent.values()) {
    if (list.length < 2) continue;
    const confs = list.map((g) => g.guest.confirmation).join(", ");
    for (const g of list) {
      g.reason = `${g.reason} (${list.length} rooms: ${confs})`;
    }
  }

  return { hotel, weekend, stay, guests, checkIn, checkOut };
}

export function bookingNote(guest: RoomingGuest): string {
  const bits = [`Conf #${guest.confirmation}`, guestDisplayName(guest)];
  if (guest.roomType) bits.push(guest.roomType);
  if (guest.rate != null) bits.push(`$${guest.rate}`);
  return bits.join(" · ");
}
