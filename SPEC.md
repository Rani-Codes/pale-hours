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
| Host snapshot send | 20 Hz |
| Remote player interpolation delay | ~100ms |
| Lag compensation rewind cap | 200ms |

- **Prediction:** each client simulates its own movement immediately and reconciles against host snapshots.
- **Hits:** the host rewinds survivor positions to what the killer saw at the moment of the attack, then checks the hit.
- **Transport:** WebRTC data channels. Unreliable and unordered for inputs and snapshots, reliable for lobby and events.
- **NAT traversal:** STUN first (`stun.cloudflare.com`). TURN fallback in Week 4.
- **Topology:** star. All survivors connect to the killer's browser.

## Architecture

```
Survivor browser  --inputs-->   Killer browser (host)  --snapshots-->  Survivor browser
(client prediction)              /sim as WASM, authoritative            (interpolation)
        \_____ room code via /signal (only to connect) _____/
```

The same `/sim` package later runs as a dedicated Go server with no rewrite.

## Milestones

### Week 1: netcode spike (riskiest work first)
- [x] `/sim`: movement for 2 players on a flat plane, fixed tick, unit tests
- [x] Compile `/sim` to WASM and run it in the browser
- [ ] `/signal`: local room-code signaling server
- [ ] Two tabs connected over WebRTC data channels
- [ ] Client prediction and reconciliation for the local player, interpolation for the remote player
- [ ] Latency test harness (delay plus loss), with movement verified at 100ms and 200ms
- [ ] Generate the project verification skill

### Week 2: the scary part
- [ ] Three.js gray-box map
- [ ] Killer first-person camera, survivor third-person camera
- [ ] Fog, darkness, killer proximity audio (a heartbeat that ramps up as the killer gets close)

### Week 3: the game loop
- [ ] Generators with skill checks, then exit gates
- [ ] Killer attack with lag-compensated hits
- [ ] Injured and downed states, carry, hook, rescue
- [ ] Win and loss conditions

### Week 4: playable with friends
- [ ] Lobby with room codes, 5 players
- [ ] TURN fallback
- [ ] Low-poly art and sound pass
- [ ] Playtest with 4 real people and log every "that hit felt unfair" moment

## Out of scope for the MVP

Killer powers, perks, progression, matchmaking, accounts, mobile, host migration, anti-cheat.

## Open decisions

- Final name.
- Standard Go vs TinyGo for WASM (bundle size). Start with standard Go, measure, then decide. Measured 2026-10-14 with Go 1.24.5: movement-only `sim.wasm` is 1.74 MB raw, 0.51 MB gzipped.
- Production signaling host (must fit a free tier).