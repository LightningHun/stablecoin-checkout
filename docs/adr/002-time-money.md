# Exact values and server-aware deadlines

Context: ETH needs eighteen decimal places; suspended tabs and client clock changes break tick-count countdowns.

Options: floating point math and decrementing timers; a decimal library and wall-clock offset; scaled BigInt plus a server-time sample anchored to monotonic time.

Decision: use strict decimal strings and scaled BigInt. The supplied total_due controls transfer instructions. ClockService derives remaining time from the absolute expiry and monotonic elapsed time with round-trip uncertainty. Focus/visibility triggers reconciliation. Local zero hides transfer instructions; only verified server expiry enables recovery.

Consequences: values retain precision without a general decimal arithmetic dependency. A timestamp is still an estimate; delayed samples can conservatively hide a quote early. Funds-observed states ignore the original deadline. The tests separately control server time, wall clock and delayed callbacks.
