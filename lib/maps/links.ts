// Links that open an address in Apple Maps or Google Maps, for the address
// picker on player, parent and contact pages (app/components/MapLink.tsx).

// One line, the way both map apps search best: a multi-line address (an
// external contact's) is joined with commas.
export function mapQuery(address: string): string {
  return address
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/,$/, ""))
    .filter(Boolean)
    .join(", ")
    .replace(/\s+/g, " ")
    .trim();
}

export function appleMapsUrl(address: string): string {
  return `https://maps.apple.com/?q=${encodeURIComponent(mapQuery(address))}`;
}

export function googleMapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery(address))}`;
}
