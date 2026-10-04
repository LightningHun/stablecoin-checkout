import { describe, expect, it } from "vitest";
import {
  automaticRetryLimit,
  isDefiniteRejection,
  isRecoverableStatusFailure,
  manualRetryInterval,
  manualRetryLimit,
  nextPollDelay,
} from "../../src/features/checkout/application/retryPolicy";
import { ApiError } from "../../src/features/checkout/infrastructure/paymentClient";

// Literal expectations transcribed from the documented retry contract.
describe("status retry policy", () => {
  it("keeps the documented five automatic, three manual and ten-second limits", () => {
    expect(automaticRetryLimit).toBe(5);
    expect(manualRetryLimit).toBe(3);
    expect(manualRetryInterval).toBe(10000);
  });
  it("schedules outage retries at 2, 4, 8, 16 and 30 seconds from a 2 s poll", () => {
    const delays = [0, 1, 2, 3, 4, 5, 9].map((automaticRetries) =>
      nextPollDelay(2000, { retryOutage: true, automaticRetries, failures: 7 }),
    );
    expect(delays).toEqual([2000, 4000, 8000, 16000, 30000, 30000, 30000]);
  });
  it("backs off on consecutive non-outage failures and polls normally without any", () => {
    const outside = (failures: number) =>
      nextPollDelay(2000, { retryOutage: false, automaticRetries: 3, failures });
    expect([0, 1, 2, 3, 4, 5, 6].map(outside)).toEqual([
      2000, 2000, 4000, 8000, 16000, 30000, 30000,
    ]);
  });
  it("caps every delay at thirty seconds for a slower poll interval", () => {
    expect(
      nextPollDelay(20000, { retryOutage: true, automaticRetries: 1, failures: 0 }),
    ).toBe(30000);
  });
  it.each([
    new TypeError("Network request failed"),
    new DOMException("Aborted", "AbortError"),
    new ApiError("Transport unavailable", 0),
    new ApiError("HTTP 500", 500),
    new ApiError("Gateway timeout", 504),
  ])("treats $message as a recoverable status failure", (cause) => {
    expect(isRecoverableStatusFailure(cause)).toBe(true);
  });
  it.each([
    new ApiError("Unknown payment", 404),
    new ApiError("Quote has not expired", 409),
    new ApiError("Invalid JSON", 0, true),
    new ApiError("Invalid data despite HTTP 500 text", 500, true),
  ])("does not treat $message as a recoverable status failure", (cause) => {
    expect(isRecoverableStatusFailure(cause)).toBe(false);
  });
  it("recognises only 4xx responses as definite mutation rejections", () => {
    expect(isDefiniteRejection(new ApiError("Unsupported pair", 400))).toBe(true);
    expect(isDefiniteRejection(new ApiError("Funds observed", 409))).toBe(true);
    expect(isDefiniteRejection(new ApiError("Not found", 499))).toBe(true);
    expect(isDefiniteRejection(new ApiError("Server error", 500))).toBe(false);
    expect(isDefiniteRejection(new ApiError("Lost", 0))).toBe(false);
    expect(isDefiniteRejection(new ApiError("Bad payload", 0, true))).toBe(false);
    expect(isDefiniteRejection(new TypeError("Disconnected"))).toBe(false);
  });
});
