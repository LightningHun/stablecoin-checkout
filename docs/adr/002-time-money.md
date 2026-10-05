# ADR 002: Exact amounts and absolute deadlines

Status: Accepted. Clock-continuity handling and verification limits are recorded below; historical test failures are not current test results.

## Context

The API returns decimal strings and token precision. Floating-point calculations can change small amounts, especially for ETH. Browser timers can run late, and an underpaid payment has both received funds to preserve and a deadline for sending the remainder.

## Options

| Concern | Alternatives |
| --- | --- |
| Money | JavaScript `Number`, or exact arithmetic on decimal strings and scaled units. |
| Time | Decrement a counter on each callback, or calculate against an absolute expiry. |
| Underpaid | Remove its countdown, introduce a new deadline field, or use the existing `quote.expires_at`. |

## Decision

Use decimal strings at API/UI boundaries and scaled `BigInt` for arithmetic. Validate against the API's `decimals`. Display the backend's `total_due`, or `amount_outstanding` for underpaid, without recalculating it from the rate. Fiat formatting also preserves exact digits.

Calculate remaining time from `quote.expires_at`. Sample a valid `x-server-time`, otherwise HTTP `Date`, otherwise browser receipt time. Anchor the sample to `performance.now()` and account for half the request round-trip time as uncertainty. The 250ms ticker asks for a new calculation; it does not count down stored seconds. Focus/visibility changes request reconciliation under the existing request and retry policy.

Capture wall and monotonic readings at the start of each request. If elapsed readings diverge by more than two seconds before its response is accepted, do not use that response to re-anchor time or clear clock uncertainty. Valid payment facts can still be accepted under the existing transition rules, but deadline-dependent transfer instructions stay blocked until a later request provides a usable clock sample. Do not latch local expiry from the device wall clock before the first accepted sample.

Apply the original deadline to awaiting-payment instructions and the outstanding part of underpaid. At zero, hide transfer controls. Underpaid keeps its received amounts, reference and API status, and continues polling within retry limits. For underpaid, once the deadline has been observed, a later clock sample cannot reopen the same top-up window. Detected and confirming do not use the original countdown.

Backend confirmation progression is separate: a payment read adds confirmations according to the selected network's interval. The browser never marks a payment paid merely because its own timer elapsed.

## Consequences

- Tiny amounts remain exact, but parsing and display require explicit precision handling.
- Delayed callbacks do not extend a quote when the monotonic clock keeps advancing.
- Time uncertainty can hide instructions early. Without a server time header, device-clock skew cannot be corrected.
- The underpaid deadline latch protects a deadline already observed. Request-local clock checkpoints address the separate case where an old response spans a stopped monotonic clock; neither mechanism should be described as proof of physical sleep coverage.
- There is no dedicated immediate `pageshow` handler. A pageshow-only return relies on a later ticker or response if no focus/visibility event is delivered. The 250ms ticker period is not a maximum delay while a browser is suspended.
- Previous failed-test counts describe earlier runs. This ADR does not claim that those failures still reproduce or that a documentation update has rerun the suite.

## Code and evidence

- [Money operations](../../src/features/checkout/domain/money.ts)
- [ClockService](../../src/features/checkout/infrastructure/ClockService.ts)
- [Quote policy](../../src/features/checkout/domain/quotePolicy.ts)
- [Backend confirmation calculation](../../backend/progression.ts)
- [Reproducible checks and verification limits](../../README.md#checks)
- [Current time-handling explanation](../DESIGN_DOC.md#time-the-browser-countdown-and-backend-confirmations)
