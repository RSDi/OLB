// Shared household computation. Used by the households list view and the
// /family/[id] page. Pure: given members + relationships, returns a stable
// list of households with cross-linked adult children and (for solo cards)
// parents.

import type { DirectoryMember, DirectoryRelationship } from "./data";
import { displayName, lastNameLower } from "./format";

export interface Household {
  key: string;
  heads: DirectoryMember[];
  children: DirectoryMember[];
  adultChildren: DirectoryMember[];
  parents: DirectoryMember[];
}

function normalizeAddress(addr: string | null): string | null {
  if (!addr) return null;
  return addr.toLowerCase().replace(/\s+/g, " ").trim();
}

export function computeHouseholds(
  members: DirectoryMember[],
  rels: DirectoryRelationship[]
): Household[] {
  const memberById = new Map(members.map((m) => [m.id, m]));
  const approved = new Set(members.map((m) => m.id));

  const parentsOf = new Map<string, string[]>();
  const childrenOf = new Map<string, string[]>();
  const spouseOf = new Map<string, string>();

  for (const r of rels) {
    if (!approved.has(r.member_id) || !approved.has(r.related_member_id)) continue;
    if (r.relationship === "parent") {
      const arr = parentsOf.get(r.member_id) ?? [];
      arr.push(r.related_member_id);
      parentsOf.set(r.member_id, arr);
    } else if (r.relationship === "child") {
      const arr = childrenOf.get(r.member_id) ?? [];
      arr.push(r.related_member_id);
      childrenOf.set(r.member_id, arr);
    } else if (r.relationship === "spouse") {
      spouseOf.set(r.member_id, r.related_member_id);
    }
  }

  // Dependent = listed under a parent's household via relationships.
  // Married members or members with their own children always head their own.
  // Extended-category members are never dependents — even childless adults
  // who live elsewhere (e.g. Courtney) should anchor to their own household
  // and attach to their parents' household as adult children.
  const isDependent = (id: string): boolean => {
    if (memberById.get(id)?.directory_category === "extended") return false;
    if ((parentsOf.get(id) ?? []).length === 0) return false;
    if (spouseOf.has(id)) return false;
    if ((childrenOf.get(id) ?? []).length > 0) return false;
    return true;
  };

  const heads = members.filter((m) => !isDependent(m.id));
  const headIds = new Set(heads.map((h) => h.id));

  const seenAsPartner = new Set<string>();
  const households: Household[] = [];
  const placed = new Set<string>();

  for (const head of heads) {
    if (seenAsPartner.has(head.id)) continue;
    const spouseId = spouseOf.get(head.id);
    const spouse =
      spouseId && headIds.has(spouseId) ? memberById.get(spouseId) ?? null : null;
    if (spouse) seenAsPartner.add(spouse.id);

    const childIds = new Set<string>();
    for (const cid of childrenOf.get(head.id) ?? []) {
      if (isDependent(cid)) childIds.add(cid);
    }
    if (spouse) {
      for (const cid of childrenOf.get(spouse.id) ?? []) {
        if (isDependent(cid)) childIds.add(cid);
      }
    }
    const children = [...childIds]
      .map((id) => memberById.get(id))
      .filter((m): m is DirectoryMember => Boolean(m))
      .sort((a, b) => (a.birthday ?? "").localeCompare(b.birthday ?? ""));

    households.push({
      key: head.id,
      heads: spouse ? [head, spouse] : [head],
      children,
      adultChildren: [],
      parents: [],
    });
    placed.add(head.id);
    if (spouse) placed.add(spouse.id);
    for (const c of children) placed.add(c.id);
  }

  // Address fallback for sibling-only or otherwise unlinked households.
  const byAddr = new Map<string, DirectoryMember[]>();
  for (const m of members) {
    if (placed.has(m.id)) continue;
    const key = normalizeAddress(m.address);
    if (!key) continue;
    const arr = byAddr.get(key) ?? [];
    arr.push(m);
    byAddr.set(key, arr);
  }
  for (const group of byAddr.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) =>
      (a.birthday ?? "").localeCompare(b.birthday ?? "")
    );
    households.push({
      key: `addr-${sorted[0].id}`,
      heads: [sorted[0]],
      children: sorted.slice(1),
      adultChildren: [],
      parents: [],
    });
    for (const m of group) placed.add(m.id);
  }

  // Remaining members → solo households. Extended-category never qualify.
  for (const m of members) {
    if (placed.has(m.id)) continue;
    households.push({
      key: m.id,
      heads: [m],
      children: [],
      adultChildren: [],
      parents: [],
    });
  }

  // Cross-link via parent/child relationships across households. A child is
  // listed as an "adult child" of a household if they're either:
  //   - a head of their own household (independent adult), or
  //   - an extended-category member (lives elsewhere, family link only).
  const householdHeadIds = new Set<string>(
    households.flatMap((h) => h.heads.map((x) => x.id))
  );
  const adultChildEligible = (cid: string) => householdHeadIds.has(cid);
  for (const hh of households) {
    const adultChildSet = new Set<string>();
    const ownChildIds = new Set(hh.children.map((c) => c.id));
    for (const head of hh.heads) {
      for (const cid of childrenOf.get(head.id) ?? []) {
        if (!adultChildEligible(cid)) continue;
        if (ownChildIds.has(cid)) continue;
        if (hh.heads.some((h) => h.id === cid)) continue;
        adultChildSet.add(cid);
      }
    }
    hh.adultChildren = [...adultChildSet]
      .map((id) => memberById.get(id))
      .filter((m): m is DirectoryMember => Boolean(m))
      .sort((a, b) => (a.birthday ?? "").localeCompare(b.birthday ?? ""));

    if (hh.heads.length === 1 && hh.children.length === 0) {
      const parentSet = new Set<string>();
      for (const pid of parentsOf.get(hh.heads[0].id) ?? []) {
        if (householdHeadIds.has(pid)) parentSet.add(pid);
      }
      hh.parents = [...parentSet]
        .map((id) => memberById.get(id))
        .filter((m): m is DirectoryMember => Boolean(m));
    }
  }

  households.sort((a, b) => {
    const al = lastNameLower(a.heads[0]);
    const bl = lastNameLower(b.heads[0]);
    if (al !== bl) return al.localeCompare(bl);
    return displayName(a.heads[0]).localeCompare(displayName(b.heads[0]));
  });

  return households;
}

// Returns the household containing the given member (as head, child, or
// adult-child reference). Children-as-dependents live inside the parent's
// household; for adult children we return their *own* household (not the
// parent's).
// Returns the family this member visually belongs to:
//   - A dependent → their parent's household (always).
//   - A head of a multi-person household → their own household.
//   - A solo head who is recorded as someone's adult child → that parent's
//     household (e.g. Jason Backens linked to Dan/Melanie; Courtney too).
//   - A truly solo member with no parent link → null.
export function findFamilyFor(
  households: Household[],
  memberId: string
): Household | null {
  for (const h of households) {
    if (h.children.some((m) => m.id === memberId)) return h;
  }
  for (const h of households) {
    if (!h.heads.some((m) => m.id === memberId)) continue;
    const total = h.heads.length + h.children.length + h.adultChildren.length;
    if (total > 1) return h;
  }
  for (const h of households) {
    if (h.adultChildren.some((m) => m.id === memberId)) return h;
  }
  return null;
}

// Returns the household where the member's parents are the heads — i.e. the
// family they were born into. Useful on married members' profiles ("FAMILY
// Sutton · Miszuk" — current name + maiden name).
export function findBirthFamilyFor(
  households: Household[],
  parentIds: string[]
): Household | null {
  if (parentIds.length === 0) return null;
  for (const h of households) {
    if (parentIds.some((pid) => h.heads.some((head) => head.id === pid))) {
      return h;
    }
  }
  return null;
}

export function findHouseholdFor(
  households: Household[],
  memberId: string
): Household | null {
  // Prefer the household where the member is a head/dependent over one where
  // they're only listed as an adult child — adult children typically appear
  // in their own household first, but extended-only members live exclusively
  // in their parent's adultChildren list.
  for (const h of households) {
    if (h.heads.some((m) => m.id === memberId)) return h;
    if (h.children.some((m) => m.id === memberId)) return h;
  }
  for (const h of households) {
    if (h.adultChildren.some((m) => m.id === memberId)) return h;
  }
  return null;
}
