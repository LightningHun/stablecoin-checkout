/**
 * Lazy confirmation progression for the mock: one confirmation per network
 * interval since the funds were observed, never beyond the required count.
 * Returns null while no full interval has elapsed. Pure; the server decides
 * whether and when to store the result.
 */
export function advanceConfirmations(
  payment: { confirmations: number; required_confirmations: number },
  reachedAt: number,
  now: number,
  intervalMs: number,
): { confirmations: number; advancedAt: number } | null {
  const elapsed = Math.floor((now - reachedAt) / intervalMs);
  if (elapsed <= 0) return null;
  const gained = Math.min(
    elapsed,
    payment.required_confirmations - payment.confirmations,
  );
  // Retain partial intervals and settle at the due time, even on a late read.
  return {
    confirmations: payment.confirmations + gained,
    advancedAt: reachedAt + gained * intervalMs,
  };
}
