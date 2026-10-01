# One controller owns the payment lifecycle

Context: payment state, connection health and transfer availability can disagree. A transfer may already be detected while the status endpoint is unavailable.

Options: separate component fetch loops; a global state-machine store; a page-scoped composable with plain TypeScript policies.

Decision: CheckoutPage creates one usePaymentController. Typed presentational children emit intent. Immutable accepted snapshots use shallowRef; domain guards reject stale generations and regressions. Health and quote availability stay separate.

Consequences: cancellation, timers and visibility listeners have one disposal point. The controller owns serial network work, so a long request can delay a later mutation. Tests must exercise that delay and stale callbacks explicitly. No global store is needed for this single page.
