// @vitest-environment node
import { describe, expect, it } from "vitest";
import { advanceConfirmations } from "../../backend/progression";

// Literal timings transcribed from the catalogue contract (Tron 60 s, Ethereum 180 s).
const reachedAt = Date.parse("2026-08-14T08:44:02.120Z");
describe("mock confirmation progression", () => {
  it("does not advance before one full interval has elapsed", () => {
    expect(
      advanceConfirmations(
        { confirmations: 0, required_confirmations: 1 },
        reachedAt,
        reachedAt + 59999,
        60000,
      ),
    ).toBeNull();
  });
  it("advances exactly one confirmation at the interval boundary", () => {
    expect(
      advanceConfirmations(
        { confirmations: 0, required_confirmations: 1 },
        reachedAt,
        reachedAt + 60000,
        60000,
      ),
    ).toEqual({ confirmations: 1, advancedAt: reachedAt + 60000 });
  });
  it("keeps partial intervals and settles at the crossing time, not the read time", () => {
    expect(
      advanceConfirmations(
        { confirmations: 0, required_confirmations: 3 },
        reachedAt,
        reachedAt + 400000,
        180000,
      ),
    ).toEqual({ confirmations: 2, advancedAt: reachedAt + 360000 });
  });
  it("never exceeds the required confirmations on a very late read", () => {
    expect(
      advanceConfirmations(
        { confirmations: 2, required_confirmations: 3 },
        reachedAt,
        reachedAt + 1000000,
        180000,
      ),
    ).toEqual({ confirmations: 3, advancedAt: reachedAt + 180000 });
  });
});
