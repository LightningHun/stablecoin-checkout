export interface ExplorerConfig {
  readonly name: string;
  readonly base: string;
  readonly suffix: string;
  readonly pattern: RegExp;
}

// Keys match API network IDs; base and suffix surround the encoded transaction hash.
// Keep patterns free of g/y flags so shared validation has no lastIndex state.
export const explorers: ReadonlyMap<string, ExplorerConfig> = new Map([
  [
    "ethereum",
    {
      name: "Etherscan",
      base: "https://etherscan.io/tx/",
      suffix: "",
      pattern: /^0x[0-9a-f]{64}$/i,
    },
  ],
  [
    "polygon",
    {
      name: "PolygonScan",
      base: "https://polygonscan.com/tx/",
      suffix: "",
      pattern: /^0x[0-9a-f]{64}$/i,
    },
  ],
  [
    "tron",
    {
      name: "TRONSCAN",
      base: "https://tronscan.org/transaction/",
      suffix: "/overview",
      pattern: /^[0-9a-f]{64}$/i,
    },
  ],
  [
    "solana",
    {
      name: "Solscan",
      base: "https://solscan.io/tx/",
      suffix: "",
      pattern: /^[1-9A-HJ-NP-Za-km-z]{64,88}$/,
    },
  ],
]);
