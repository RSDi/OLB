// Where to stay and eat on a weekend away: the hotels and places to eat in
// External Contacts (the types marked Travel in Settings → Contact Types,
// like Hotels and Food) near the weekend's place. A place is near when its city is the weekend's, or when it's tagged
// with it: a hotel in Ankeny tagged "des moines" shows on Des Moines weekends
// (and, by its city, on Ankeny's). A place tagged "closed" is left out.
// Pure, so the schedule and the tests share it. Safe to import from client
// components.

export type TravelKind = "hotel" | "food";

// Contact type names that mean the same, for a database from before the
// Travel setting (migration 0110), and for that migration's first pass.
export const TRAVEL_TYPE_NAMES: Record<TravelKind, string[]> = {
  hotel: ["hotels", "hotel", "lodging", "hotel blocks"],
  food: ["food", "restaurants", "restaurant", "dining", "places to eat"],
};

export function travelKind(typeName: string | null | undefined): TravelKind | null {
  const t = (typeName ?? "").trim().toLowerCase();
  if (TRAVEL_TYPE_NAMES.hotel.includes(t)) return "hotel";
  if (TRAVEL_TYPE_NAMES.food.includes(t)) return "food";
  return null;
}

export interface TravelPerson {
  id: string;
  name: string;
  title: string | null;
  phone: string | null;
  mobile_phone: string | null;
  email: string | null;
}

export interface TravelPlace {
  id: string;
  kind: TravelKind;
  name: string;
  city: string | null;
  state: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  tags: string[];
  people: TravelPerson[];
}

// "Des Moines" from "Des Moines, IA", "des moines" or "Des  Moines".
export function placeKey(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/[.'’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// The city a weekend is in, from its Where: "Des Moines, IA" → "Des Moines".
export function weekendCity(location: string | null | undefined): string | null {
  const city = (location ?? "").split(",")[0].trim();
  return city || null;
}

const isClosed = (p: Pick<TravelPlace, "tags">) => p.tags.some((t) => placeKey(t) === "closed");

export interface PlacesNear {
  // The weekend's city as its Where writes it, for the heading.
  city: string;
  hotels: TravelPlace[];
  food: TravelPlace[];
}

export function placesNear(location: string | null | undefined, places: TravelPlace[]): PlacesNear | null {
  const city = weekendCity(location);
  if (!city) return null;
  const here = placeKey(city);
  const near = places
    .filter((p) => !isClosed(p) && (placeKey(p.city) === here || p.tags.some((t) => placeKey(t) === here)))
    // The ones with notes (where we've been) first, then in town, then by name.
    .sort(
      (a, b) =>
        Number(!!b.notes?.trim()) - Number(!!a.notes?.trim()) ||
        Number(placeKey(b.city) === here) - Number(placeKey(a.city) === here) ||
        a.name.localeCompare(b.name)
    );
  const hotels = near.filter((p) => p.kind === "hotel");
  const food = near.filter((p) => p.kind === "food");
  return hotels.length || food.length ? { city, hotels, food } : null;
}
