import type { Currency, Network, Pair } from "./paymentModel";
/** Catalogue lookups in API order. Codes and network ids are unique per the catalogue schema. */
export const findCurrency = (
  currencies: readonly Currency[],
  code: string,
): Currency | undefined =>
  currencies.find((currency) => currency.code === code);
export const findNetwork = (
  currencies: readonly Currency[],
  pair: Pair,
): Network | undefined =>
  findCurrency(currencies, pair.currency)?.networks.find(
    (network) => network.id === pair.network,
  );
