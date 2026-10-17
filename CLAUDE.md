# CLAUDE.md

Original 1v4 asymmetric horror game that runs in the browser. One killer hunts four survivors. Full design lives in `SPEC.md`. Read it before any non-trivial task.

## Repo layout

```
/sim       Go. Pure game simulation. Compiled to WASM for the host's browser now, a dedicated server later.
/client    TypeScript + Vite + Three.js. Rendering, input, audio, networking glue.
/signal    TypeScript Cloudflare Worker. Room-code signaling for WebRTC, one Durable Object per room. In production the same Worker also serves the built client.
/tools     Test harnesses, latency simulators, scripts.
```

## Commands

Fill these in as they get created. Keep this section accurate.

- Build sim to WASM: `cd client && npm run wasm` (writes `client/public/sim.wasm` and copies Go's `wasm_exec.js`)
- Run client dev server: `cd client && npm install && npm run dev` (rebuilds the WASM first, serves http://localhost:5173)
- Type-check and build the client: `cd client && npm run build`
- Install the driver dependencies once: `cd tools && npm install`
- Drive the lobby: create, join, pick roles, Start, a late joiner refused, a guest killer swinging at the host's survivor: `cd tools && node drive-lobby.mjs http://localhost:5173/ lobby ["delay=100&loss=0.05"]` (needs signaling and dev servers). Every other match driver goes through the same lobby with `tools/lib/lobby.mjs`
- Drive two tabs over WebRTC in real Chrome: `cd tools && node drive-link.mjs http://localhost:5173/ link` (needs signaling server and dev server running; writes `link-host.png`, `link-guest.png`)
- Run client unit tests: `cd client && npm test` (Node's built-in runner, no extra deps)
- Play: create a room or join one by code, pick Killer or Survivor, and the creator presses Start once two or more have picked. Click the canvas for mouse look (WASD moves relative to where you face), M toggles the overhead map, hold E near a generator or a powered gate to repair or open it (up to three survivors can work one generator, each adding to its speed) and press Space when a skill check needle is in the bright zone, then walk out down the lane behind an open gate; the killer left-clicks to attack and presses E to pick up, hang on a hook, or drop; survivors press Space beside a standing pallet to throw it down once (it stuns a killer within 3 m for 3 s, and can then be vaulted) and beside a window to vault it, the killer holds E beside a dropped pallet for 3 s to break it, hold C to crouch (slow, and hidden from the killer in tall grass unless he is within 5 m), hold E by a downed teammate to help them up (skill check), when carried alternate E and Q fast to wriggle free, and when hooked press E for a 10% chance to wriggle off (2 tries); the killer stands still for the first 5 s of a match and by a hooked one to unhook them; once out, Space or click switches who you spectate; the host clicks Rematch after a match ends, or Back to lobby to return everyone to role selection
- Walk a guest into a wall and check host and guest agree: `cd tools && node drive-wall.mjs http://localhost:5173/ wall ["delay=100&loss=0.05"]` (needs signaling and dev servers; expects 0 corrections)
- Check the survivor heartbeat tracks killer distance: `cd tools && node drive-heartbeat.mjs http://localhost:5173/ heartbeat` (needs signaling and dev servers; checks the audio context is running and the beat rate and gain, not the actual sound)
- Repair a generator and hit and miss a skill check, host and guest agreeing: `cd tools && node drive-generator.mjs http://localhost:5173/ generator ["delay=100&loss=0.05"]` (needs signaling and dev servers)
- Open a gate and escape: `cd tools && node drive-gates.mjs http://localhost:5173/ gates ["delay=100&loss=0.05"]` (needs signaling and dev servers; marks four generators done on the host as setup, the rest is real keys: the shut gate blocks, opening brings skill checks, the killer stops at the gate line but hits into the lane, and escaping takes a walk down the exit lane)
- Attack and down a survivor, with lag-compensated hits at the cone edge: `cd tools && node drive-attack.mjs http://localhost:5173/ attack ["delay=100&loss=0.05"]` (needs signaling and dev servers; places players with `paleSim.load`, then real clicks and keys)
- Help up, carry, break free, hook, the other survivor's hook alert, hook skill checks, rescue and hook death with three tabs: `cd tools && node drive-hook.mjs http://localhost:5173/ hook ["delay=100&loss=0.05"]` (needs signaling and dev servers; places and downs players with `paleSim.load`, then real keys)
- End a match and spectate with three tabs: `cd tools && node drive-endgame.mjs http://localhost:5173/ endgame ["delay=100&loss=0.05"]` (needs signaling and dev servers; opens a gate and hangs a survivor through `paleSim.load`, then real keys; covers the hooked heartbeat, spectating, every end screen, the freeze, and Rematch)
- Crouch in tall grass, hide from a far killer, show to a near one, host and guest agreeing: `cd tools && node drive-crouch.mjs http://localhost:5173/ crouch ["delay=100&loss=0.05"]` (needs signaling and dev servers; places players with `paleSim.load`, then real keys)
- Art review screenshots: `cd tools && node drive-look.mjs http://localhost:5173/ look [spot ...]` (needs signaling and dev servers; add `&light=review` to the URL for full light; spots: generator hook gate exit survivors injured downed lane edge open; prints frame rate)
- Art review of the killer and survivor animations in third person, three tabs: `cd tools && node drive-look-killer.mjs http://localhost:5173/ killer` (needs signaling and dev servers; idle, windup, strike, first-person swing, walk, crawl, carry, repair, limp)
- Throw down, stun with and break pallets, then vault one, host and guest agreeing: `cd tools && node drive-pallet.mjs http://localhost:5173/ pallet ["delay=100&loss=0.05"]` (needs signaling and dev servers; places players with `paleSim.load`, then real keys)
- Vault a window, and check the killer cannot: `cd tools && node drive-vault.mjs http://localhost:5173/ vault ["delay=100&loss=0.05"]` (needs signaling and dev servers; places players with `paleSim.load`, then real keys)
- Simulate a bad network in any tab: add `?delay=100&jitter=20&loss=0.05` to the URL (one-way delay on everything the tab sends; jitter and loss only on the unreliable channel)
- Drive host and guest over a simulated bad network in real Chrome: `cd tools && node drive-netplay.mjs http://localhost:5173/ netplay "delay=100&loss=0.05"` (needs signaling and dev servers; checks prediction, host agreement, and remote interpolation)
- Verify in an isolated stack: `.claude/skills/verify/scripts/launch.sh`, then `doctor.sh`, drive, and `cleanup.sh` (see `.claude/skills/verify/SKILL.md`)
- Run the latency matrix (every network profile, 3 runs each, one table): `cd tools && node latency-matrix.mjs [runs]` (reuses running signaling and dev servers, or starts and stops its own; exits nonzero on any failure)
- Run signaling server: `cd signal && npm install && npm run dev` (`wrangler dev` on http://localhost:8787, `-- --port N` to change; runs the real Worker and Durable Object locally, no Cloudflare account needed)
- Run signal tests: `cd signal && npm test` (typecheck, room unit tests, then the real Worker under `wrangler dev` over HTTP and WebSocket)
- Live site: https://palehours.ranisaro.com (the `pale-hours` Worker on the owner's Cloudflare account, free plan; config in `signal/wrangler.jsonc`)
- Deploy: push to `main`. `.github/workflows/ci.yml` runs the sim, signal and client tests and the client build on every pull request and push; on `main` a green run then deploys with `wrangler deploy`, using the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets. A red check blocks the deploy. The Playwright drivers need real Chrome and do not run in CI, so run them on the isolated stack before pushing
- Check the live site: `cd tools && node drive-link.mjs https://palehours.ranisaro.com/ live-link` (no `?signal=`; the page signals to its own origin)
- Run sim tests: `cd sim && go test ./...`
- Run feedback intake tests: `node --test tools/feedback/*.test.mjs` (from the repo root; the rules for new issues, see `SPEC.md` Community feedback loop)
- File feedback: friends post in the owner's Discord channel; the owner copies what is worth tracking into https://github.com/Rani-Codes/pale-hours/issues/new?template=feedback.yml. To let someone file directly, add their GitHub username to `.github/feedback-allowlist.txt` and push
- Build approved feedback: run the `build-feedback` skill (`.claude/skills/build-feedback/`). One `approved` issue becomes one pull request; the owner merges

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

Use the project `verify` skill (`.claude/skills/verify/`). It launches an isolated stack on ports 5273 and 8887, never the user's 5173 and 8787, drives real Chrome tabs, and keeps evidence in `.verify/evidence/`. Its feature map is `.claude/skills/verify/features/`. Netcode changes are proven with host and guest tabs under 100ms and 200ms round trip with 5% loss (the latency matrix covers both). Keep the map current with `/pstack:maintain-verification-skill`.

## pstack

@~/.claude/pstack-models.md
