import { ApiError } from "../infrastructure/paymentClient";
/**
 * Pure retry policy for real-payment status GET failures. The controller owns
 * every request, timer and budget counter; this module only answers questions.
 */
export const automaticRetryLimit = 5;
export const manualRetryLimit = 3;
/** Minimum spacing between two manual retry starts, in milliseconds. */
export const manualRetryInterval = 10000;
const maxPollDelay = 30000;
/**
 * Delay before the next automatic status poll. During a retry outage the
 * automatic ordinal drives the backoff (2, 4, 8, 16, 30 s at pollMs 2000);
 * otherwise consecutive failures do. Each step doubles and caps at 30 s.
 */
export function nextPollDelay(
  pollMs: number,
  state: { retryOutage: boolean; automaticRetries: number; failures: number },
): number {
  const exponent = state.retryOutage
    ? state.automaticRetries
    : Math.max(0, state.failures - 1);
  return Math.min(maxPollDelay, pollMs * 2 ** Math.min(exponent, 4));
}
/**
 * Network, timeout and 5xx failures of a status GET are recoverable and start
 * or continue the limited retry episode. Protocol faults, 404 and other 4xx
 * responses are definite answers, not connection problems.
 */
export function isRecoverableStatusFailure(cause: unknown): boolean {
  return (
    !(cause instanceof ApiError) ||
    (!cause.protocol && (cause.status === 0 || cause.status >= 500))
  );
}
/** Only a 4xx rejection proves a mutation POST created nothing on the server. */
export function isDefiniteRejection(cause: unknown): boolean {
  return cause instanceof ApiError && cause.status >= 400 && cause.status < 500;
}
