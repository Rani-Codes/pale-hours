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
- **Getting up (decided 2026-10-15).** A teammate holds E beside a downed survivor. A skill check appears after 0.2 s; a good one stands them up injured at once, a miss costs nothing but the time, and the next check follows 0.2 s later. Left alone for 60 s, a downed survivor stands up injured by themselves; being picked up resets that.
- **Hooks (decided 2026-10-15).** Six hooks in open ground. The killer presses E by a downed survivor to pick them up (carrying slows him to 3.8 m/s and he cannot attack), then E again: within 2 m of a free hook he hangs them, anywhere else he drops them. A teammate holding E beside the hook for 1 s unhooks them injured. Each survivor has 60 s of hook time in total across all their hooks; rescue does not refill it, so a second hook is shorter. When it runs out they are eliminated. No wiggle-free from the killer's shoulder yet.
- **Health bar.** A survivor sees two squares: two filled healthy, one injured, none when downed, carried or hooked. Getting up, by themselves or with help, and being unhooked both leave one.
- **Hit shove.** A hit pushes the survivor forward: a 0.33 s burst that carries a running survivor 2.2 m. Only survivors get it.
- **Killer attack:** left click. A short windup, then a forward cone hit resolved by the host with lag compensation. Two hits take a survivor from healthy to downed. A downed survivor cannot be hit again. They can crawl slowly, and they recover very slowly if left alone. The only way to eliminate a survivor is to pick them up and hang them on a hook.
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
- **Hits:** the swing lands 0.2 s after the click and is judged on that tick against survivors where the killer's screen last drew them. Judging at the click instead would let a survivor be hit where they stood before the windup. The sim keeps each player's last 8 tick positions (`Player.Trail`) and the killer's input carries `ViewLagMs`; the swing rewinds survivors by it, capped at 200 ms.
- **What "the killer saw" is (decided 2026-10-15).** The killer hosts, so the killer's tab draws the host's own state, not the 70 ms interpolation buffer guests use. It draws up to two ticks behind the tick being stepped, and the host measures that gap every tick: 33 to 50 ms in practice, whatever the network. That gap is the whole rewind today. The trail and the 200 ms cap are there for a dedicated server later, where the killer is a remote client and the lag adds their interpolation delay and one-way latency.
- **What rewind cannot fix.** A survivor's own screen runs ahead of the host by their one-way latency plus the host's input buffer. A survivor who ducks behind a wall on their screen at the last moment can still be hit if the host had not yet received that movement. Rewinding favors the attacker's view by design; removing this would mean favoring the victim, which makes hits feel random to the killer. Log every such case in the Phase 4 playtest before changing it.
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
- [x] A failed skill check makes noise the killer can perceive (a gold beam over the generator for 2 s, visible through walls and fog, plus a HUD line with distance and bearing)
- [x] Exit gates (`GateSites` at the north and south edges; powered at 4 generators, 5 s to open by hand, a survivor within range of an open gate escapes and leaves play)
- [ ] The noise beam is visible to every client in the snapshot today; strip noise for survivors in the host's snapshots when we add anti-cheat or fog of information
- [ ] Generator tuning pass in a real playtest: 80 s of repair per generator, check gap 4 to 9 s, zone 7 ticks (about 0.23 s)
- [x] Killer attack with lag-compensated hits (left click; 0.2 s windup, 2.2 m 100° cone blocked by walls and generators, 0.6 s recovery on a hit and 1.0 s on a whiff; a hit survivor sprints for 2 s; downed survivors crawl at 0.7 m/s and cannot be hit; numbers in `sim/config.go`, logic in `sim/attack.go`)
- [x] Injured and downed states, carry, hook, rescue (see the MVP scope notes above; logic in `sim/downed.go`, numbers in `sim/config.go`)
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

- **Med kits (planned by the owner).** Kits placed around the map that a survivor picks up, carries, and uses on themselves or a teammate. Presumably healing one step (injured to healthy); open questions: how long a heal takes, whether it has a skill check, how many kits, whether one kit has several uses, and whether it can get a downed teammate up. Needs pickups as sim state and an inventory slot per survivor.

- **Survivor dash.** One short burst of speed, usable once, then a 30 second cooldown. The cooldown shows on the HUD so the survivor knows when it is ready again. Purpose: let a survivor open a gap on the killer. Open questions: burst length and distance, whether it passes through windows or vaults, whether it makes noise, and how it interacts with the killer's attack range. Needs the cooldown in sim state and the dash as an input bit, so the host stays authoritative. Not scheduled.

## Out of scope for the MVP

Killer powers, perks, progression, matchmaking, accounts, mobile, host migration, anti-cheat.

## Open decisions

- Final name.
- Standard Go vs TinyGo for WASM (bundle size). Start with standard Go, measure, then decide. Measured 2026-10-14 with Go 1.24.5: movement-only `sim.wasm` is 1.74 MB raw, 0.51 MB gzipped.
- Production signaling host (must fit a free tier).
- Movement speed. First playtest (2026-10-14, dots page): stops, starts, and diagonals feel good, but both roles feel a little slow. Retune in `sim/config.go` once the map has obstacles.
