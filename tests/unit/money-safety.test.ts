import { describe, expect, it } from "vitest";
import {
  formatUnits,
  parseUnits,
} from "../../src/features/checkout/domain/money";

describe("money conversion scale validation", () => {
  it.each([-1, 1.5, NaN, Infinity, -Infinity, 256])(
    "rejects invalid scale %s in both conversion directions",
    (scale) => {
      expect(() => parseUnits("1", scale)).toThrow();
      expect(() => formatUnits(100n, scale)).toThrow();
    },
  );
  it.each([undefined, null, "6", true])(
    "does not coerce a runtime scale of %j",
    (scale) => {
      expect(() => parseUnits("1", scale as unknown as number)).toThrow();
      expect(() => formatUnits(100n, scale as unknown as number)).toThrow();
    },
  );
  it.each([
    [2n, 0, "2"],
    [9007199254740993123456n, 6, "9007199254740993.123456"],
    [1n, 8, "0.00000001"],
    [1123456789012345678n, 18, "1.123456789012345678"],
    [1n, 24, "0.000000000000000000000001"],
    [1n, 255, "0." + "0".repeat(254) + "1"],
  ] as const)(
    "preserves exact formatting for %s at scale %s",
    (units, scale, expected) => {
      expect(formatUnits(units, scale)).toBe(expected);
      expect(parseUnits(expected, scale)).toBe(units);
    },
  );
  it("retains signed results and minimum fraction formatting for valid scales", () => {
    expect(formatUnits(-1234567n, 6)).toBe("-1.234567");
    expect(formatUnits(1000000n, 6)).toBe("1.00");
    expect(formatUnits(1000000n, 6, 0)).toBe("1");
  });
});
