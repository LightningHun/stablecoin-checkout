# Atomic mock mutations and explicit uncertainty

Context: the source API omits late-fund, replacement and uncertain-POST guarantees. Requote keeps the payment reference.

Options: silently invent idempotency/reconciliation endpoints; retry failed creation; document a minimal mock policy and stop unsafe actions during uncertainty.

Decision: mock replacement and requote validate funds atomically after delay. Client requests are serialized; creation is never automatically retried after an uncertain result. Requote first reconciles, then uses the server's expiry-only mutation. Demo controls are explicitly available at ?demo=1.

Consequences: an uncertain creation without a known reference needs merchant assistance/reset in the demo. Terminal expiry stops polling, so late transfers need a future real-service contract. No provider capability or refund promise is implied.
