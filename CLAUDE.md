# CLAUDE.md

Original 1v4 asymmetric horror game that runs in the browser. One killer hunts four survivors. Full design lives in `SPEC.md`. Read it before any non-trivial task.

## Repo layout

```
/sim       Go. Pure game simulation. Compiled to WASM for the host's browser now, a dedicated server later.
/client    TypeScript + Vite + Three.js. Rendering, input, audio, networking glue.
/signal    Tiny signaling server for WebRTC room codes. Local Go server for dev.
/tools     Test harnesses, latency simulators, scripts.
```

## Commands

Fill these in as they get created. Keep this section accurate.

- Build sim to WASM: `cd client && npm run wasm` (writes `client/public/sim.wasm` and copies Go's `wasm_exec.js`)
- Run client dev server: `cd client && npm install && npm run dev` (rebuilds the WASM first, serves http://localhost:5173)
- Type-check and build the client: `cd client && npm run build`
- Drive the dots page in real Chrome: `cd tools && npm install && node drive-dots.mjs http://localhost:5173/ dots.png` (dev server must be running)
- Drive two tabs over WebRTC in real Chrome: `cd tools && node drive-link.mjs http://localhost:5173/ link` (needs signaling server and dev server running; writes `link-host.png`, `link-guest.png`)
- Run client unit tests: `cd client && npm test` (Node's built-in runner, no extra deps)
- Simulate a bad network in any tab: add `?delay=100&jitter=20&loss=0.05` to the URL (one-way delay on everything the tab sends; jitter and loss only on the unreliable channel)
- Drive host and guest over a simulated bad network in real Chrome: `cd tools && node drive-netplay.mjs http://localhost:5173/ netplay "delay=100&loss=0.05"` (needs signaling and dev servers; checks prediction, host agreement, and remote interpolation)
- Run signaling server: `cd signal && go run .` (http://localhost:8787, `-addr` to change)
- Run signal tests: `cd signal && go test -race ./...`
- Run sim tests: `cd sim && go test ./...`

## Hard rules

1. **The sim is pure.** No I/O, no clocks, no randomness without a seed passed in. Same inputs plus same seed must produce the same state. Rendering and networking never live in `/sim`.
2. **The host is the only authority.** Clients send inputs, never outcomes. A client never decides that a hit landed, a generator finished, or a player escaped.
3. **Latency first.** Game state and inputs go over unreliable, unordered WebRTC data channels. Lobby and one-off events go over a reliable channel. Never put per-tick traffic on a reliable channel.
4. **Every netcode change gets verified with simulated latency** (see Verification). Passing unit tests alone is not proof.
5. **Original IP only.** No names, characters, maps, art, audio, perk names, or lore from Dead by Daylight or any other game. Mechanics are fine. Copied content is not.
6. **Tunable numbers live in one config file,** not scattered as magic numbers.
7. **AGPL-3.0 project.** Only add dependencies with AGPL-compatible licenses (MIT, BSD, Apache-2.0, ISC, MPL-2.0, LGPL, GPL-3.0). Check the license before adding anything. Never vendor code or assets without a compatible license.

## Working style

- Small tasks. Work milestone items in order and commit after each one.
- Write sim tests first (table-driven Go tests).
- Default model is Sonnet. Do not spawn parallel subagents. This project runs on a limited plan.
- When a task finishes, update the Commands section and tick the item in `SPEC.md`.

## Verification

Once Phase 1 is runnable, generate a project verification skill with `/pstack:create-verification-skill`. Until then, prove netcode work by running two browser tabs (host and client) against each other with added delay (100ms and 200ms) and packet loss (5%), and capturing what each tab shows.

## pstack

@~/.claude/pstack-models.md
