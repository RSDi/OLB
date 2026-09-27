// Board majority: first to floor(n/2)+1 wins, computed live from the
// current number of eligible voters (approved staff with portal accounts).
// 7 board members → 4; the floor of 1 keeps a one-person board from
// deadlocking. Mirrors the SQL in cast_request_vote (migration 0050) — keep
// the two in sync.
export function majorityThreshold(eligibleVoters: number): number {
  return Math.max(1, Math.floor(eligibleVoters / 2) + 1);
}
