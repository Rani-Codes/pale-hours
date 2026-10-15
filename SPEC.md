# SPEC.md

Working title: Pale Hours.

## Pillars

1. **Horror through asymmetry.** The killer sees in first person with a narrow field of view. Survivors use a third-person camera and can see around corners. Fog and sound do the rest.
2. **Skill-based.** Chases and hits must feel fair. Outcomes come from player decisions, not lag.
3. **Low latency.** UDP-style transport, client prediction, and lag-compensated hits.
4. **$0 hosting.** Peer to peer. The killer's browser hosts the match.

## Look

PS1-style low-poly, low-res textures, heavy fog, dithering. The fog hides draw distance, which keeps performance high in the browser.

## MVP scope

- 1 map, gray-boxed first, around 60m x 60m, with tiles of walls, windows, and pallets for chases.
- 1 killer with a basic attack and no special power yet.
- 4 survivors with identical abilities.
- 5 generators. Survivors must repair 4. Repairing is hold-to-progress, interrupted by skill checks (a timing input). A failed check costs progress and makes noise.
- 2 exit gates. They become powered when the generator goal is met. A gate takes a few seconds to open.
- Health states: healthy, injured, downed. Two hits takes a survivor from healthy to downed.
- Downed survivors can be picked up, carried, and placed on a hook. Teammates can rescue them. A hook timer eliminates the survivor when it runs out.
- Win condition: survivors escape through a gate, or the killer eliminates everyone.
- Lobby with a shareable room code. The killer hosts.

## Netcode

| Item | Starting value |
| --- | --- |
| Sim tick | 30 Hz (try 60 later) |
| Client input send | every rendered frame, batched |
| Host snapshot send | 30 Hz (every tick) |
| Remote player interpolation delay | ~70ms plus measured jitter |
| Lag compensation rewind cap | 200ms |

- **Prediction:** each client simulates its own movement immediately and reconciles against host snapshots.
- **Hits:** the host rewinds survivor positions to what the killer saw at the moment of the attack, then checks the hit.
- **Transport:** WebRTC data channels. Unreliable and unordered for inputs and snapshots, reliable for lobby and events.
- **NAT traversal:** STUN first (`stun.cloudflare.com`). TURN fallback in Phase 4.
- **Verification:** `tools/latency-matrix.mjs` runs host and guest tabs at 100ms and 200ms round trip with 5% loss, plus jitter and a 400ms stress profile. Latencies there are round trip.
- **Topology:** star. All survivors connect to the killer's browser.

## Architecture

```
Survivor browser  --inputs-->   Killer browser (host)  --snapshots-->  Survivor browser
(client prediction)              /sim as WASM, authoritative            (interpolation)
        \_____ room code via /signal (only to connect) _____/
```

The same `/sim` package later runs as a dedicated Go server with no rewrite.

## Milestones

Phases run in order, each as fast as the work allows. They are not calendar weeks. Items marked "(use Opus)" have subtle netcode timing bugs that are costly to debug, so switch to Opus for them. Sonnet is fine for the rest.

### Phase 1: netcode spike (riskiest work first)
- [x] `/sim`: movement for 2 players on a flat plane, fixed tick, unit tests
- [x] Compile `/sim` to WASM and run it in the browser
- [x] `/signal`: local room-code signaling server
- [x] Two tabs connected over WebRTC data channels
- [x] Client prediction and reconciliation for the local player, interpolation for the remote player (use Opus)
- [x] Latency test harness (delay plus loss), with movement verified at 100ms and 200ms
- [x] Generate the project verification skill

### Phase 2: the scary part
- [x] Three.js gray-box map (layout and wall collision live in `sim/map.go`; the client builds meshes from `paleSim.walls`)
- [ ] Randomized map layout per match: generate walls from a seed (host picks it, guests receive it in the match setup), so players can't memorize the map. Needs `Walls` to move from a package global into sim state, and a generator that guarantees spawns and loops stay valid, with tests.
- [x] Killer first-person camera, survivor third-person camera (click the canvas for mouse look, M toggles an overhead map; facing is `Yaw` in sim input and state)
- [x] Fog and darkness (tunables in `view.fog` and `view.light`; the viewer carries a dim lantern)
- [x] Killer proximity audio (synthesized heartbeat in `client/src/heartbeat.ts`, soft lowpassed thud, master volume slider and [ ] keys; silent beyond 32 m, speeds up and gets louder as the killer closes in, survivors only)

### Phase 3: the game loop
- [x] Generators with skill checks (5 sites in `sim/map.go`, repair and checks in `sim/generator.go`; hold E, press Space in the zone; a miss costs 3 s of progress)
- [ ] A failed skill check makes noise the killer can perceive (needs a killer-side cue: sound direction or a brief aura; decide which)
- [ ] Exit gates: powered once 4 generators are done, a few seconds to open
- [ ] Generator tuning pass in a real playtest: 80 s of repair per generator, check gap 4 to 9 s, zone 7 ticks (about 0.23 s)
- [ ] Killer attack with lag-compensated hits (use Opus)
- [ ] Injured and downed states, carry, hook, rescue
- [ ] Win and loss conditions

### Phase 4: playable with friends
- [ ] Lobby with room codes, 5 players
- [ ] TURN fallback
- [ ] Low-poly art and sound pass
- [ ] Playtest with 4 real people and log every "that hit felt unfair" moment

## After launch: community feedback loop

Not part of the MVP. Set this up once the game is playable by others.

- **Intake.** Players report bugs and suggest features in a community channel, probably a Discord server with a thread for this game.
- **Tracking.** Every report becomes a GitHub issue in this repo, labeled `bug` or `feature`, so nothing lives only in chat.
- **Bugs.** An LLM agent can pick up a bug, fix it on a dev branch, and show the owner the result. The owner approves it (it ships to production), scraps it, or sends feedback for another round. Nothing reaches production without that approval.
- **Features.** No work starts on a feature until the owner explicitly approves it. After approval it follows the same dev branch and review path as a bug.
- Open questions: how reports get from Discord into issues (a bot, or by hand), what "production" means for a peer-hosted game (the hosted client build and signaling server), and how the owner signals approval (an issue label, a PR review, or a Discord reaction).

## Ideas under consideration

- **Survivor dash.** One short burst of speed, usable once, then a 30 second cooldown. The cooldown shows on the HUD so the survivor knows when it is ready again. Purpose: let a survivor open a gap on the killer. Open questions: burst length and distance, whether it passes through windows or vaults, whether it makes noise, and how it interacts with the killer's attack range. Needs the cooldown in sim state and the dash as an input bit, so the host stays authoritative. Not scheduled.

## Out of scope for the MVP

Killer powers, perks, progression, matchmaking, accounts, mobile, host migration, anti-cheat.

## Open decisions

- Final name.
- Standard Go vs TinyGo for WASM (bundle size). Start with standard Go, measure, then decide. Measured 2026-10-14 with Go 1.24.5: movement-only `sim.wasm` is 1.74 MB raw, 0.51 MB gzipped.
- Production signaling host (must fit a free tier).
- Movement speed. First playtest (2026-10-14, dots page): stops, starts, and diagonals feel good, but both roles feel a little slow. Retune in `sim/config.go` once the map has obstacles.
