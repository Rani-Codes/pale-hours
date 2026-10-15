# Pale Hours verification map

This directory is the maintained source for verifying what a player can do in Pale Hours. Read this index before driving the app, then use the matching feature file as the recipe.

## Baseline preconditions

- Start the isolated stack with `.claude/skills/verify/scripts/launch.sh` and require a passing `.claude/skills/verify/scripts/doctor.sh`.
- Drive `http://localhost:5273/?signal=http://localhost:8887`. Every tab URL carries the `signal` query.
- Never drive the user's own servers on 5173 and 8787.
- Run drivers from `tools/`. Run `npm install` there once if `tools/node_modules` is missing.

## Driving conventions

- One Playwright browser context per player, system Chrome, launched with `--disable-features=WebRtcHideLocalIpsWithMdns`.
- Hand the page real key presses and lobby clicks. Read state through `paleSim.state()` and `paleSession.stats()`.
- Wait for the sim to pass tick 30 before measuring, and assert against ticks elapsed, not wall-clock time.
- Apply the same `delay`, `jitter` and `loss` query to both tabs when simulating a network.

## Proof and skip reporting

- Save artifacts in `.verify/evidence/<timestamp>-<feature>/`: driver stdout as a `.log`, plus screenshots.
- A multi-tab proof compares the two tabs. One tab's view alone is not proof.
- Report which sub-feature IDs a run covered. A sub-feature you did not drive is unverified, even if a neighbor passed.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the behavior a player sees. It then has four H2 sections in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with Playwright`, and `Gotchas`.

## Features

- [Local movement](./local-movement.md) covers the offline page with both players in one tab.
- [Room link](./room-link.md) covers hosting a room, joining by code, join progress, and the round-trip readout.
- [Netplay](./netplay.md) covers guest prediction, host authority, and smooth remote players.
- [Network simulation](./network-simulation.md) covers the bad-network URL query and the latency matrix.
