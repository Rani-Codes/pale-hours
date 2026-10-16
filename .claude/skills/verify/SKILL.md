---
name: verify
description: Launch an isolated Pale Hours stack (Go signaling server plus the Vite browser client with the WASM sim) and drive it in real Chrome through Playwright to prove gameplay and netcode behavior, with screenshots and logs as evidence. Use after any change to client/, sim/, or signal/, and always for netcode changes, which must be proven under simulated delay and loss.
---

# Verify Pale Hours

Pale Hours is a browser game. The user surface is one page at `/` that runs the Go sim as WASM, draws players on a canvas, and has a Host / CODE / Join lobby. One tab hosts (the killer, the only authority) and other tabs join as survivors over WebRTC, using the signaling server only to connect. Read `features/README.md` for the feature map, then the matching feature file as the recipe.

All paths below are relative to the repo root.

## Launch

```bash
.claude/skills/verify/scripts/launch.sh
```

Builds `sim.wasm`, builds the signaling server, and starts both on their own ports: app on 5273, signaling on 8887 (override with `PALE_VERIFY_APP_PORT` and `PALE_VERIFY_SIGNAL_PORT`). It refuses to start if those ports are taken or a stack is already recorded. When both servers are usable it prints the one URL to drive:

```
http://localhost:5273/?signal=http://localhost:8887
```

Ready means the page is served with title `Pale Hours`, `/sim.wasm` returns 200, and the signaling server answers. Logs and PIDs live in `.verify/run/`. There is no database or seed data. Every match starts from the spawn points in `client/src/config.ts`.

The user often runs their own dev server on 5173 and signaling on 8787. Never drive, restart, or kill those. The `?signal=` query is what keeps a test tab off the user's signaling server, so every URL you drive must carry it.

## Doctor

```bash
.claude/skills/verify/scripts/doctor.sh
```

Read-only. Checks that each recorded process is alive and owns its port, the page is Pale Hours, `sim.wasm` is newer than every `sim/*.go` file, and the signaling room API answers. It prints `DOCTOR FAIL: <reason>` and exits nonzero otherwise. Run it first, and again whenever a driver fails strangely.

## Drive

The harness is Playwright (`playwright-core`, installed in `tools/`) driving the system Chrome (`channel: "chrome"`), one browser context per player. The drivers are in `tools/` and each takes the app URL first. Run them from `tools/`:

```bash
APP="http://localhost:5273/?signal=http://localhost:8887"
node drive-dots.mjs "$APP" <evidence-dir>/dots.png
node drive-link.mjs "$APP" <evidence-dir>/link
node drive-netplay.mjs "$APP" <evidence-dir>/netplay "delay=100&loss=0.05"
PALE_APP_PORT=5273 PALE_SIGNAL_PORT=8887 PALE_EVIDENCE_DIR=<evidence-dir>/matrix node latency-matrix.mjs 3
```

Each prints `PASS` / `FAIL` lines and exits nonzero on failure. Stable handles for a new driver:

- Lobby: `#host` button, `#code` input, `#join` button. Status text in `#netstatus` reads `hosting room ABCD`, `connecting: <ice stage> (n.n s)`, `connected to <peer>`, then `rtt reliable … ms   unreliable … ms`.
- HUD text in `#hud` names the mode and every player's position in meters.
- `globalThis.paleSim.state()` is the sim state in this tab. On the host it is authoritative. On a guest it is the guest's prediction.
- `globalThis.paleSession.stats()` exists for host and guest sessions. The host reports `{tick, guests: [{id, ack, depth, dropped}]}`. The guest reports `{selfId, seq, unacked, corrections, predicted, renderTick, starved, newestTick}`.
- `paleSession.view(performance.now(), 0).players` is what the tab would draw this frame.
- Lobby: there is no offline mode. The room creator hosts; each tab picks `#pick-killer` or `#pick-survivor`; the host clicks `#start`. `tools/lib/lobby.mjs` (`startMatch(host, guests, {killer})`) does this with real clicks; every match driver uses it. `paleSession.room()` is the lobby as the tab sees it.
- Keys: every player moves with WASD or the arrow keys, relative to where they face.

To simulate a bad network, add `delay` (ms, one way, on everything this tab sends), `jitter` (ms, unreliable channel only) and `loss` (0 to 1, unreliable channel only) to the URL. Apply them to both tabs. A round trip is about twice `delay`.

Launch Chrome with `--disable-features=WebRtcHideLocalIpsWithMdns`, as every driver does. Without it, ICE between two automated tabs stalls on "checking".

## Evidence

Put every artifact for a run in `.verify/evidence/<YYYYmmdd-HHMMSS>-<feature>/`. This folder is gitignored and cleanup keeps it. For each driver, save its stdout with `tee <dir>/<name>.log` alongside the screenshots it writes. A netplay proof is the log line showing each check, the `METRICS {...}` line, and one host and one guest screenshot.

Proof standards:

- Drive the real user path. Press keys and click the lobby buttons. Never call `paleSim.load` or `step` to fake movement.
- Capture the action and the result: the before and after state from `paleSim.state()` or `stats()`, plus a screenshot of each tab.
- For netcode, compare the two tabs. The host's position for a player must equal that guest's prediction once input stops. Seeing one tab move proves nothing.
- Any netcode change gets the latency matrix, or at least `drive-netplay` at `delay=50&loss=0.05` and `delay=100&loss=0.05` (100 and 200 ms round trip). A pass without simulated lag does not count.

## Cleanup

```bash
.claude/skills/verify/scripts/cleanup.sh
```

Stops only the PIDs that `launch.sh` recorded and removes `.verify/run/`. It never kills by process name. Evidence in `.verify/evidence/` survives. Run cleanup after every run, including failed ones.

## Helpers

- `scripts/launch.sh` starts the isolated stack and prints the URL to drive.
- `scripts/doctor.sh` is the read-only health check.
- `scripts/cleanup.sh` stops what launch started and keeps the evidence.
- `tools/drive-*.mjs` and `tools/latency-matrix.mjs` are the drivers. Their usage is in each file's first comment.
