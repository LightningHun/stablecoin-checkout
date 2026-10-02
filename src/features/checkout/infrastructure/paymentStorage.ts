const storageKey = (orderId: string) =>
  `stablecoin-checkout:payment-reference:${orderId}`;

export function loadReference(orderId = "ORD-88213"): string | null {
  try {
    return window.localStorage.getItem(storageKey(orderId)) || null;
  } catch {
    return null;
  }
}

export function saveReference(reference: string, orderId = "ORD-88213"): void {
  try {
    window.localStorage.setItem(storageKey(orderId), reference);
  } catch {
    // A blocked or full store must not interrupt the live checkout.
  }
}

export function clearReference(orderId = "ORD-88213"): void {
  try {
    window.localStorage.removeItem(storageKey(orderId));
  } catch {
    // Checkout remains usable when browser storage is unavailable.
  }
}
