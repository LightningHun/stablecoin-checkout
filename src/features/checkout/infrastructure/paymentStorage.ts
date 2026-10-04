const storageKey = (orderId: string) =>
  `stablecoin-checkout:payment-reference:${orderId}`;

export function loadReference(orderId = "ORD-88213"): string | null {
  try {
    return window.localStorage.getItem(storageKey(orderId)) || null;
  } catch {
    return null;
  }
}

export function saveReference(reference: string, orderId = "ORD-88213"): boolean {
  try {
    window.localStorage.setItem(storageKey(orderId), reference);
    return true;
  } catch {
    // A blocked or full store must not interrupt the live checkout.
    return false;
  }
}

export function clearReference(orderId = "ORD-88213"): void {
  try {
    window.localStorage.removeItem(storageKey(orderId));
  } catch {
    // Checkout remains usable when browser storage is unavailable.
  }
}

const pendingCreationKey = (orderId: string) =>
  `stablecoin-checkout:creation-pending:${orderId}`;

export function hasPendingCreation(orderId: string): boolean {
  try {
    return window.localStorage.getItem(pendingCreationKey(orderId)) === "1";
  } catch {
    return false;
  }
}

export function markCreationPending(orderId: string): void {
  try {
    window.localStorage.setItem(pendingCreationKey(orderId), "1");
  } catch {
    // The controller still protects this session when browser storage is blocked.
  }
}

export function clearPendingCreation(orderId: string): void {
  try {
    window.localStorage.removeItem(pendingCreationKey(orderId));
  } catch {
    // Retaining a marker is safer than silently retrying an unresolved creation.
  }
}
