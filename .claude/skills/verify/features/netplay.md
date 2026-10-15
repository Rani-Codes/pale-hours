# Netplay

When a guest joins, it becomes a survivor that moves the instant its player presses a key, even on a slow network. The host's tab decides where everyone really is. The guest sees the killer and other survivors move smoothly, a little behind the host.

## Sub-features

- `net-predict` moves the guest's own survivor within a few frames of a key press, before any round trip.
- `net-agree` makes the host's position for the guest exactly equal the guest's prediction once input stops, with zero corrections.
- `net-acks` keeps the guest's unacknowledged inputs near one round trip.
- `net-remote-smooth` draws the killer on the guest without backward steps or jumps larger than two frames of motion.
- `net-remote-converge` draws the killer exactly where the host has it once it stops.
- `net-latency` reports how long after a host key press the killer starts moving on the guest.

## How to get to it (user POV)

- Host in one tab and join from another, then move with WASD (killer on the host, survivor on the guest).

## Driving it with Playwright

Preconditions:

- Doctor passes. Two fresh tabs with the same network query.

- **Full check under lag.** Run `node drive-netplay.mjs "$APP" <dir>/netplay "delay=100&loss=0.05" | tee <dir>/netplay.log`. Each sub-feature appears as a `PASS` line. The `METRICS` line records join time, killer latency, corrections, starved frames and dropped inputs. `netplay-host.png` and `netplay-guest.png` show both tabs.
- **Both latencies.** Repeat with `delay=50&loss=0.05`. Netcode changes need both runs, or the latency matrix.
- **Clean link.** Repeat with no query. Expect zero corrections and killer latency around 50 to 80 ms.

## Gotchas

- Killer latency varies by about ±25 ms per run because the sim only advances every 33 ms. Compare averages over at least 5 runs, not single runs.
- The killer distance check is a lower bound only, because Playwright's key-up can reach the host tab late.
- A guest that never gets a welcome message shows `joined, waiting for host` and never predicts.
- Starved frames up to a handful under 5% loss are expected. The pass condition is the jump check.
