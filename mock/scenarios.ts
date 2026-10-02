import { parseUnits, formatUnits } from "../src/features/checkout/domain/money";

export type Fault = "none" | "500" | "disconnect" | "slow";
export interface Scenario {
  fault: Fault;
  delayMs: number;
  ttlMs: number;
  orderAmount: string;
}
export const defaultScenario = (): Scenario => ({
  fault: "none",
  delayMs: 5000,
  ttlMs: 900000,
  orderAmount: "149.90",
});

export function normalizeOrderAmount(value: unknown): string {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)(\.\d{1,2})?$/.test(value))
    throw new Error("Invalid order amount");
  const cents = parseUnits(value, 2);
  if (cents < 1n || cents > 99999999n) throw new Error("Invalid order amount");
  return formatUnits(cents, 2);
}
