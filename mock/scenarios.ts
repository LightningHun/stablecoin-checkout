export type Fault = "none" | "500" | "disconnect" | "slow";
export interface Scenario {
  fault: Fault;
  delayMs: number;
  ttlMs: number;
}
export const defaultScenario = (): Scenario => ({
  fault: "none",
  delayMs: 5000,
  ttlMs: 900000,
});
