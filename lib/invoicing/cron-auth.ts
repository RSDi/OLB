/** Fail closed: no secret, or the bearer doesn't match. */
export function invoiceCronUnauthorized(authHeader: string | null, secret: string | undefined): boolean {
  return !secret || authHeader !== `Bearer ${secret}`;
}
