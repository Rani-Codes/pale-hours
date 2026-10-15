# Network simulation

Any tab can pretend to be on a bad network by adding `delay`, `jitter` and `loss` to its URL. The status line then reads `simulating N ms delay, N ms jitter, N% loss on send`. The latency matrix runs the netplay check under every standard profile and prints one table.

## Sub-features

- `sim-query` applies delay to both channels and jitter and loss only to the unreliable one.
- `sim-banner` shows the simulation settings in `#netstatus`.
- `sim-matrix` runs the clean, 100 ms, 200 ms, jitter, and 400 ms stress profiles and fails if any run fails.

## How to get to it (user POV)

- Open `$APP&delay=100&loss=0.05` in both tabs, then host and join.
- Run the latency matrix from `tools/`.

## Driving it with Playwright

Preconditions:

- Doctor passes.

- **Query takes effect.** Run netplay with `delay=100`. The log's rtt line reads about 200 ms on both channels, and the status line shows the banner.
- **Matrix.** Run `PALE_APP_PORT=5273 PALE_SIGNAL_PORT=8887 PALE_EVIDENCE_DIR=<dir>/matrix node latency-matrix.mjs 3 | tee <dir>/matrix.log`. It prints `reusing` for both servers, a table with 3/3 in every row, and `PASS`. It takes about 4 minutes.

## Gotchas

- `delay` is one way and applies to each tab's sends. `delay=100` on both tabs is a 200 ms round trip.
- Without the port variables, the matrix targets and reuses the user's servers on 5173 and 8787.
- Jitter reorders packets on the unreliable channel only. The reliable channel stays in order by design.
