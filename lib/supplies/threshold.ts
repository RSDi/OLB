// Pure crossing predicate for low-stock alerts: fire only when on_hand drops
// THROUGH the reorder threshold (was above, now at/below). A supply already
// sitting at/below threshold must not re-alert on further drops — that's the
// difference between one useful "reorder filters" ping and a nagging channel.
export function crossedThreshold(prevOnHand: number, newOnHand: number, threshold: number): boolean {
  return prevOnHand > threshold && newOnHand <= threshold;
}
