// Release notes: types, version numbering, and the seen-marker helpers.
// The list itself lives in ./releases.ts (hand-maintained, newest first).
// Safe to import from tests and client components.

export const SEEN_PREF_KEY = "releases_seen_version";
export const RELEASES_SEEN_EVENT = "releases:seen";

export interface Release {
  version: string;
  date: string;
  title: string;
  color: string;
  features: string[];
  // Guided tour id(s) in lib/help/tours.ts. The first that can run for this
  // person is what **Show me how →** starts.
  tour?: string | string[];
}

// What an entry looks like in AUTHORED: version optional, filled in by
// withVersions() from the nearest versioned row below it.
export type AuthoredRelease = Omit<Release, "version"> & { version?: string };

// Fill omitted versions from position. The oldest entry must carry a
// version to anchor the sequence (e.g. "26.10.0"); each row above it is
// that number plus the distance. Two notes added the same day both omit
// version, the merge stacks them, and each lands on its own number.
export function withVersions(entries: AuthoredRelease[]): Release[] {
  const out: Release[] = new Array(entries.length);
  let anchor: { major: number; minor: number; patch: number } | null = null;
  let distance = 0;
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e.version) {
      const [major, minor, patch] = e.version.split(".").map(Number);
      if ([major, minor, patch].some((n) => !Number.isInteger(n))) {
        throw new Error(`releases.ts: bad version "${e.version}" on "${e.title}"`);
      }
      anchor = { major, minor, patch };
      distance = 0;
      out[i] = { ...e, version: e.version };
    } else {
      if (!anchor) {
        throw new Error(`releases.ts: the oldest entry ("${e.title}") must carry a version to anchor the sequence`);
      }
      distance += 1;
      out[i] = { ...e, version: `${anchor.major}.${anchor.minor}.${anchor.patch + distance}` };
    }
  }
  for (let i = 0; i + 1 < out.length; i++) {
    if (cmpVersion(out[i].version, out[i + 1].version) <= 0) {
      throw new Error(
        `releases.ts: versions must descend — "${out[i].version}" (${out[i].title}) sits above "${out[i + 1].version}" (${out[i + 1].title})`
      );
    }
  }
  return out;
}

// Segment-wise numeric compare: "26.10.9" < "26.10.10" < "26.11.0".
export function cmpVersion(a: string, b: string): number {
  const as = a.split(".").map(Number);
  const bs = b.split(".").map(Number);
  for (let i = 0; i < Math.max(as.length, bs.length); i++) {
    const d = (as[i] ?? 0) - (bs[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export function seenReleaseVersion(raw: unknown): string | null {
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

// Releases newer than the user's seen-marker. A user with no marker (first
// visit since this shipped) gets just the latest — one "what's new" nudge,
// not the whole backlog.
export function unseenReleases(releases: Release[], seen: string | null): Release[] {
  if (releases.length === 0) return [];
  if (!seen) return releases.slice(0, 1);
  return releases.filter((r) => cmpVersion(r.version, seen) > 0);
}

// Advance the marker to this list's latest, but never backward.
export function nextSeenVersion(releases: Release[], current: string | null): string | null {
  const latest = releases[0];
  if (!latest) return current;
  if (!current || cmpVersion(latest.version, current) > 0) return latest.version;
  return current;
}
