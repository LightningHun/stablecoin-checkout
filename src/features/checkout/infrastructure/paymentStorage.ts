const storageKey = "stablecoin-checkout:payment-reference:ORD-88213";

export function loadReference(): string | null {
  try {
    return window.localStorage.getItem(storageKey) || null;
  } catch {
    return null;
  }
}

export function saveReference(reference: string): void {
  try {
    window.localStorage.setItem(storageKey, reference);
  } catch {
    // A blocked or full store must not interrupt the live checkout.
  }
}

export function clearReference(): void {
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // Checkout remains usable when browser storage is unavailable.
  }
}
