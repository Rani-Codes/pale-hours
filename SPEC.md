# SPEC.md

Working title: Pale Hours.

## Pillars

1. **Horror through asymmetry.** The killer sees in first person with a narrow field of view. Survivors use a third-person camera and can see around corners. Fog and sound do the rest.
2. **Skill-based.** Chases and hits must feel fair. Outcomes come from player decisions, not lag.
3. **Low latency.** UDP-style transport, client prediction, and lag-compensated hits.
4. **$0 hosting.** Peer to peer. The room creator's browser hosts the match.

## Look

PS1-style low-poly, low-res textures, heavy fog, dithering. The fog hides draw distance, which keeps performance high in the browser.

## MVP scope

- 1 map, gray-boxed first, around 60m x 60m, with tiles of walls, windows, and pallets for chases.
- 1 killer with a basic attack and no special power yet.
- 4 survivors with identical abilities.
- 5 generators. Survivors must repair 4. Repairing is hold-to-progress, interrupted by skill checks (a timing input). A good check adds 3% of a generator, a failed one costs 3.75% (3 s) and makes noise; the result shows its percentage for 1 s.
- 2 exit gates. They become powered when the generator goal is met. A gate takes a few seconds to open.
- **Gates (decided 2026-10-16, owner feedback).** Each gate is set into the fence that closes the map's edge, so nobody can get behind it; shut, it blocks its opening like a wall. Opening takes 7.5 s of holding E (was 5 s) with skill checks every 2 to 3 s: a hit adds 0.5 s, a miss or letting go takes 1.5 s off. Opening it does not let anyone out: behind the gate is a walled exit lane, and a survivor escapes once they are 5 m down it, the most anyone can walk. The road is drawn running on into the fog with a police car parked just past that point, lights flashing, so it reads as running to safety. The killer never gets past the gate line, open or shut; his swing still reaches into the lane, so a survivor just past the gate can still be hit. A downed survivor who crawls down an open lane escapes too.
- **Hook alert (decided 2026-10-16, owner feedback).** When a survivor is hung on a hook, every other survivor sees a red beam over that hook, through walls and fog, and a HUD line with distance and bearing, for 3 s. The killer and the hooked survivor do not.
- Health states: healthy, injured, downed. Two hits takes a survivor from healthy to downed.
- Downed survivors can be picked up, carried, and placed on a hook. Teammates can rescue them. A hook timer eliminates the survivor when it runs out.
- **Getting up (decided 2026-10-15).** A teammate holds E beside a downed survivor. A skill check appears after 0.2 s; a good one stands them up injured at once, a miss costs nothing but the time, and the next check follows 0.2 s later. Left alone for 60 s, a downed survivor stands up injured by themselves. The timer keeps running while the killer carries them: if it fills on his shoulder they break free injured and the killer is stunned for 1.5 s (no moving, attacking or E). So a carry has whatever is left of that minute.
- **Hooks (decided 2026-10-15).** Six hooks in open ground. The killer presses E by a downed survivor to pick them up (carrying slows him to 3.8 m/s and he cannot attack), then E again: within 2 m of a free hook he hangs them, anywhere else he drops them. A teammate holding E beside the hook for 1 s unhooks them injured. Each survivor has 60 s of hook time in total across all their hooks; rescue does not refill it, so a second hook is shorter. When it runs out they are eliminated. A hooked survivor gets skill checks on the generator schedule (every 4 to 9 s, Space); a good one costs nothing, a miss or a timeout takes 5 s off their hook time.
- **Health bar.** A survivor sees two squares: two filled healthy, one injured, none when downed, carried or hooked. Getting up, by themselves or with help, and being unhooked both leave one.
- **Crouch and tall grass (decided 2026-10-16, owner request).** A survivor holds C to crouch. Crouched, they walk at 1.6 m/s (0.4 of normal), cannot repair, open a gate, help, or vault, and cannot crouch while downed, carried, hooked, vaulting or running from a hit. Six small patches of tall grass (`Grass` in `sim/map.go`, about 6 by 6 m each, in open ground and kept apart) hide a survivor who stays crouched and still inside one for half a second (any movement shows them at once and the half second starts over): the killer's screen does not draw them, in first person or on the overhead map, unless he is within 5 m. Hiding changes only what the killer sees. The swing still hits whoever is really there, and a hit stops the crouch. Tunables: `CrouchSpeed`, `HideSettleTicks`, `HideRevealRange` in `sim/config.go`; stalk density and height in `view.tallGrass`. Known limit: like the noise beam, hidden positions are still in the snapshot every client receives, so a modified client could see them. Stripping them is the same open item as hiding noise from survivors.
- **Vaults (decided 2026-10-15).** Windows: waist-high walls that block everyone's movement. A survivor beside one presses Space to vault over in 0.6 s, landing just past the far face; the killer cannot vault and must go around. Space goes to a pending skill check first; checks only appear while repairing, helping or hooked. **Updated 2026-10-17 (owner request):** nothing reaches across a window, a dropped pallet or a wall: the killer's swing misses and he cannot pick a downed survivor up across one (`blocked` in `sim/attack.go`). A standing or broken pallet is no barrier. Five on the map: the two building windows and three window loops in open ground (`Vaults` in `sim/map.go`).
- **Pallets (decided 2026-10-16, owner request).** Six wooden pallets, each hinged to a brick wall: four in the doorways of the two buildings and two at the ends of loose walls (`PalletSites` in `sim/map.go`; a test fails any pallet that touches no wall). A standing pallet is a tall board frame flush against its wall and is walked through by everyone; thrown down it tips over sideways, away from the wall, and rests steeply slanted across the gap, its top about chest high, too high to step over. A survivor within 3 m of one presses Space to throw it down, once, from either side or even standing in the doorway (they are pushed out to their own side): it then blocks everyone like a wall, and survivors can vault it like a window. A killer within 3 m of it at that moment is stunned for 3 s (no moving, swinging or E) and loses any swing in progress. The killer breaks a dropped pallet by holding E within 1.8 m for 3 s, empty-handed and not stunned; letting go starts over, and a broken pallet is gone for good. Anyone standing in its footprint when it falls is pushed out to their own side, and a survivor standing in the footprint cannot throw it. Tunables: the `Pallet*` values in `sim/config.go`. Prompts: "Space to throw down the pallet", "hold E to break the pallet", then "breaking the pallet: N s".
- **Hit shove.** A hit sends a running survivor sprinting at 7.5 m/s for 2 s (15 m; it was a 0.33 s burst of 2.2 m, then 3 m), so a killer chasing at 4.6 m/s is well over 5 m behind when it ends and takes more than 9 s to close it (`HitBoostSpeed`, `HitBoostTicks`). For those 2 s the survivor is also invincible: the killer's swing passes through them (it can still hit someone behind them), so a double hit is at least 2 s apart (`HitInvulnTicks`). Only survivors get it.
- **Killer attack:** left click. A short windup, then a forward cone hit resolved by the host with lag compensation. Two hits take a survivor from healthy to downed. A downed survivor cannot be hit again. They can crawl slowly, and they recover very slowly if left alone. The only way to eliminate a survivor is to pick them up and hang them on a hook.
- Win condition: survivors escape through a gate, or the killer eliminates everyone.
- **Generator done (decided 2026-10-16).** When a generator finishes, every tab sees a softer orange column of light and an expanding ring at it for 4 s, through walls and fog, and hears a generator engine crank over, catch with a clank and settle into a rattling idle, wherever they are. Opening a gate makes neither. Tunables: `view.generatorDone` and `audio.generatorDone` in `client/src/config.ts`.
- **Back to lobby (decided 2026-10-16).** After a match the host can press Back to lobby instead of Rematch: everyone returns to the role-pick screen with their names and picks kept, free to change them, and anyone new can join again.
- **Names (decided 2026-10-16).** Each tab starts with a random name (e.g. "HushedCrow") the player can change in the lobby, kept in localStorage once edited. The host cleans it (16 characters, no control characters) and adds a number if another player has it. Names show in the lobby, the HUD, hook alerts, spectating and the end screen.
- **Struggling on the shoulder (decided 2026-10-16, owner request).** A carried survivor presses E and Q, alternating, to wriggle free: each press of the key that is not the last counted one takes 1 s off the carry timer (`StruggleTicks`), so mashing one key does nothing and about five alternating presses a second frees them in roughly 10 to 12 s instead of a minute. When it runs out they break free injured and the killer is stunned for 1.5 s. The carried survivor's model thrashes, and the HUD says "press E then Q, again and again, to wriggle free".
- **Playtest changes (decided 2026-10-16, friends' feedback).** (1) A hooked survivor can press E to wriggle off: a 10% chance a try, 2 tries each time they are hung (`HookEscapeChance`, `HookEscapeTries`); luck takes them down injured with their hook time kept, as a rescue would. (2) The hit boost is stronger: 7.5 m/s for 2 s, with 2 s of invincibility (a second pass after the killer still caught up fast; the first made it 3 m in 0.33 s). (3) The killer attacks slower: 1.2 s recovery after a hit and 1.4 s after a whiff, so two hits are at least 1.4 s apart. (4) The killer stands still for the first 5 s of every match and rematch (`SpawnFreezeTicks`), and sees "the hunt begins in N s". (5) The killer's attack range is 20% shorter, 2.2 m to 1.76 m, measured to the nearest point of the survivor's body.
- **Crews, camera and the invincibility tint (decided 2026-10-17, owner request).** Survivors on one generator each add their own repair, so two work it twice as fast and three three times; at most 3 can work a generator (`MaxRepairers`). Someone already working keeps their place, a newcomer to a full generator is told "this generator already has 3 survivors working", and the repair line shows "generator 40%, 2 working: 2x speed". The survivor's third-person camera collides with walls (`client/src/camera.ts`): it stops 0.25 m short of the first wall on its way back, never nearer the player than 0.9 m, is pulled in at once and eases back out. A mouse-wheel zoom was added first as a workaround for the camera sitting inside walls and removed once this made it pointless. A freshly hit survivor, invincible for 2 s, glows and pulses pale blue on every screen (`SurvivorModel.glow`).
- **Wriggle-off panel (decided 2026-10-17, owner request).** A hooked survivor sees a panel above the health squares: "press E to wriggle off the hook", the odds, and a pip for each try left. A failed try spends a pip, shakes the panel and says "no luck: still hooked"; with none left it says to hold on for a teammate; coming off the hook shows "you are off the hook!" for a moment.
- **Plain HUD (decided 2026-10-16, owner request).** The screen shows only what a player acts on: health squares for survivors, `generators N/5 done` (no percentages, except the one generator you are repairing), skill checks, prompts for what to do, the kill feed, the end screen and spectating. It never shows positions, ticks, progress percentages, gate state, latency numbers or other debug output. The killer's NOISE bearing and a survivor's TEAMMATE HOOKED bearing stay: they tell the player where to go. Drivers read state through `paleSim.state()` and `paleSession.stats()`, never through hidden HUD lines.
- **Timers and carry view (decided 2026-10-16, owner request).** A downed survivor sees how many seconds are left before they get up on their own, and a carried one how many before they break free (both the same 60 s timer). A survivor repairing a generator sees `generator N%` for that generator while they work. While the killer carries someone, his camera pulls back behind him like a survivor's, so he sees the survivor on his shoulder, with a banner naming them; it returns to first person when he hangs or drops them.
- **Random spawns (decided 2026-10-16, owner request).** Every match, and every rematch, puts the killer and each survivor at a random spot in open ground, drawn from the match seed by `Spawns` in `sim/spawn.go`. No spot is inside a wall, generator or vault, within 1 m of one, or within 2 m of the fence; survivors start at least 2 m apart, and at least 5 m from the killer on x or on y (`SpawnKillerGap` and the other `Spawn*` values in `sim/config.go`). The host draws the seed and the places; guests only receive positions in snapshots. Not checked: that a spot is connected to the rest of the map. Every building has doorways, so no pocket is expected, but no test proves it.
- **Match end (decided 2026-10-15).** The match ends when every survivor has escaped or died; downed, carried and hooked survivors are still in play. Outcomes are per player: each survivor sees "You escaped" or "You died", the killer sees how many he killed ("You killed 2 of 4", "You killed them all", "They all escaped"). **Updated 2026-10-16:** the end screen now names a winner: the survivors win when half or more of them escaped, otherwise the killer wins ("Game over: the survivors win"), with the per-player line under it. Before that, whenever a survivor escapes or dies and others are still in play, every tab shows "<name> escaped" or "<name> died" for 3 s. A finished match is frozen; the host gets a Rematch button that respawns everyone still connected.
- **Spectating.** Once a survivor escapes or dies, their camera follows someone still in play, survivors first, then the killer. Space or a click switches. Their health bar hides.
- **Heartbeat.** Silent while the survivor is carried, hooked, escaped or dead, and once the match is over: it only plays when hearing it can change what they do.
- Lobby with a shareable room code (decided 2026-10-15). There is no offline mode. The room creator hosts and is the authority whatever role they play. Each player picks Killer or Survivor (one killer, up to four survivors); the creator's Start appears once there are two or more players, all picked, with one killer and at least one survivor. Joining after Start is refused with a reason. Rematch keeps the roles.

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
- **What "the killer saw" is (decided 2026-10-15).** When the host is the killer, his tab draws the host's own state, not the interpolation buffer guests use. It draws up to two ticks behind the tick being stepped, and the host measures that gap every tick: 33 to 50 ms in practice, whatever the network. When a guest is the killer, every input frame carries `seen`, the host tick his screen was drawing everyone else at, and the host rewinds by (tick being stepped minus seen). That covers his interpolation delay, one-way latency and input queueing. Measured: about 100 ms on a clean link, 220 ms at 100 ms round trip, 330 ms at 200 ms. The sim caps it at 200 ms, so a guest killer beyond roughly 100 ms round trip is judged against survivors slightly ahead of what he saw (up to 0.5 m at 200 ms round trip). The cap stops a laggy or lying killer hitting survivors far in the past; raising it trades survivor fairness for killer fairness. `seen` is a client claim, trusted only up to that cap.
- **What rewind cannot fix.** A survivor's own screen runs ahead of the host by their one-way latency plus the host's input buffer. A survivor who ducks behind a wall on their screen at the last moment can still be hit if the host had not yet received that movement. Rewinding favors the attacker's view by design; removing this would mean favoring the victim, which makes hits feel random to the killer. Log every such case in the Phase 4 playtest before changing it.
- **Transport:** WebRTC data channels. Unreliable and unordered for inputs and snapshots, reliable for lobby and events.
- **NAT traversal:** STUN first (`stun.cloudflare.com`). TURN fallback in Phase 4.
- **Verification:** `tools/latency-matrix.mjs` runs host and guest tabs at 100ms and 200ms round trip with 5% loss, plus jitter and a 400ms stress profile. Latencies there are round trip.
- **Topology:** star. Every guest connects to the room creator's browser.

## Architecture

```
Survivor browser  --inputs-->   Killer browser (host)  --snapshots-->  Survivor browser
(client prediction)              /sim as WASM, authoritative            (interpolation)
        \_____ room code via /signal (only to connect) _____/
```

The same `/sim` package later runs as a dedicated Go server with no rewrite.

### Hosting

One Cloudflare Worker on the free plan serves everything at https://palehours.ranisaro.com: the built client as static assets and the signaling API on the same origin. Each room is a Durable Object named by its room code, so one instance holds every peer in that room in memory. Peers create and join over `POST`, send signaling blobs over `POST`, and receive over one WebSocket per peer. Game traffic never touches the Worker; it goes browser to browser over WebRTC once peers connect.

Why a Worker and not the original Go server (decided 2026-10-16):

- Signaling holds a connection open per peer for the life of the room and keeps each room in one process. Free hosts that can run a long-lived Go process either sleep when idle (the first player each session waits about a minute) or require a card. Vercel's free functions stop after 300 s and do not share memory between instances.
- Durable Objects match the hub's shape (one instance per room), start in milliseconds, and need no card. The free plan allows 100,000 requests and 13,000 GB-s of run time a day; an object counts as running while any peer's socket is open, which is about 29 room-hours of play a day. Past the limit, requests fail until 00:00 UTC. Without a card on file there is no bill.
- Peers receive over WebSocket instead of Server-Sent Events because a Durable Object gets a reliable close event for a WebSocket. Under `wrangler dev` an event stream's disconnect never reached the object, which would leave a closed tab holding its seat.
- `wrangler dev` runs the same Worker locally, so dev, tests and production share one implementation. The Go server was deleted rather than kept alongside.

## Milestones

Phases run in order, each as fast as the work allows. They are not calendar weeks. Items marked "(use Opus)" have subtle netcode timing bugs that are costly to debug, so switch to Opus for them. Sonnet is fine for the rest.

### Phase 1: netcode spike (riskiest work first)
- [x] `/sim`: movement for 2 players on a flat plane, fixed tick, unit tests
- [x] Compile `/sim` to WASM and run it in the browser
- [x] `/signal`: local room-code signaling server (a Go server at first; now a Cloudflare Worker, see Hosting)
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
- [x] Generators with skill checks (5 sites in `sim/map.go`, repair and checks in `sim/generator.go`; hold E, press Space in the zone; a hit adds 3% of a generator, a miss costs 3 s)
- [x] A failed skill check makes noise the killer can perceive (a bright white beam over the generator for 1.5 s, visible through walls and fog to every player; no HUD text, so no bearing or distance)
- [x] Exit gates (`GateSites` in the north and south fences; powered at 4 generators, 7.5 s to open by hand with skill checks, then a 5 m walk down the exit lane to a waiting police car to escape; `Fences` and `Lanes` in `sim/map.go`)
- [x] Hook alert for the other survivors (`client/src/hookalert.ts`; 3 s, `view.hookAlert`)
- [ ] The noise beam is visible to every client in the snapshot today; strip noise for survivors in the host's snapshots when we add anti-cheat or fog of information
- [ ] Generator tuning pass in a real playtest: 80 s of repair per generator, check gap 4 to 9 s, zone 7 ticks (about 0.23 s)
- [x] Killer attack with lag-compensated hits (left click; 0.2 s windup, 1.76 m (was 2.2 m) 100° cone blocked by walls and generators, 1.2 s recovery on a hit and 1.4 s on a whiff (were 0.6 s and 1.0 s; a double hit is at least 1.4 s apart), at full speed (no slowdown after a swing, decided 2026-10-15); a hit survivor sprints for 2 s; downed survivors crawl at 0.7 m/s and cannot be hit; numbers in `sim/config.go`, logic in `sim/attack.go`)
- [x] Injured and downed states, carry, hook, rescue (see the MVP scope notes above; logic in `sim/downed.go`, numbers in `sim/config.go`)
- [x] Win and loss conditions (match end, per-player end screen, spectating, rematch; `matchOver` in `sim/sim.go`, screens in `client/src/endgame.ts`)

### Phase 4: playable with friends
- [x] Lobby with room codes, 5 players: role picks, Start at two or more, any role on any tab, guest killers lag-compensated from `seen` (see Netcode)
- [x] Public site at https://palehours.ranisaro.com, deployed from `main` by GitHub Actions after the tests pass (see Hosting)
- [ ] TURN fallback
- [x] Low-poly art pass, all built in code (`client/src/art/`): PS1 look (240-row render, banded color with ordered dither, vertex snapping; `view.retro`), painted textures, brick walls, generators, gallows hooks, portcullis gates, animated survivor and killer models with a first-person cleaver, fence, treeline, rocks and grass. Done 2026-10-15, before the lobby, at the owner's request.
- [ ] Sound pass (footsteps, swing and hit, generator hum, hook, gates); the heartbeat is still the synthesized placeholder
- [ ] Playtest with 4 real people and log every "that hit felt unfair" moment

## Community feedback loop

Feedback is collected on Discord and tracked on GitHub. There is no bot token, no API key, and no model in the intake path.

- **Capture.** Friends post feedback in a channel on the owner's Discord server. The owner copies what is worth tracking into the Feedback issue form (`.github/ISSUE_TEMPLATE/feedback.yml`): bug or idea, a title, what happened or what they want, and optionally which role they played. Nothing connects Discord to GitHub; copying is by hand (decided 2026-10-17). Blank issues are turned off.
- **Intake** (`.github/workflows/intake.yml`, rules in `tools/feedback/intake.mjs` with unit tests). On every new issue, and on edits while one waits for a fix:
  - Someone not in `.github/feedback-allowlist.txt` (the owner is always allowed) gets one polite comment, the label `not-invited`, and the issue closed.
  - A missing or overlong field gets one comment naming what to fix and the label `needs-info`. Editing the issue to fix it moves it on without another comment.
  - A sixth open `needs-approval` issue from the same person is closed with `over-limit`.
  - Otherwise the issue gets `needs-approval` plus `bug` or `idea`. Intake never rewrites what a friend wrote.
- **Approval.** Only the owner moves an issue from `needs-approval` to `approved`, or closes it. The agent never adds `approved`.
- **Build.** The owner runs the `build-feedback` skill (`.claude/skills/build-feedback/`). It takes one `approved` issue, works on a branch under the repo's rules, and opens a pull request that closes the issue. It never merges. A merge to `main` deploys, so the merge is the owner's second approval. The skill treats issue text as data from a friend, never as instructions.
- **Why an allowlist and not collaborators.** On a personal-account repository every collaborator gets write access, and write access can run a workflow that reads the deploy secrets. Friends do not need any access to open issues on a public repository, so the allowlist keeps feedback invite-only without granting anything.
- **Spam.** `needs-approval` already means nothing is built until the owner acts, so a flood only clutters the list. The allowlist and the per-person cap keep it readable. The workflow's own `GITHUB_TOKEN` is limited to issues.

## Ideas under consideration

- **Med kits (planned by the owner).** Kits placed around the map that a survivor picks up, carries, and uses on themselves or a teammate. Presumably healing one step (injured to healthy); open questions: how long a heal takes, whether it has a skill check, how many kits, whether one kit has several uses, and whether it can get a downed teammate up. Needs pickups as sim state and an inventory slot per survivor.

- **Survivor dash.** One short burst of speed, usable once, then a 30 second cooldown. The cooldown shows on the HUD so the survivor knows when it is ready again. Purpose: let a survivor open a gap on the killer. Open questions: burst length and distance, whether it passes through windows or vaults, whether it makes noise, and how it interacts with the killer's attack range. Needs the cooldown in sim state and the dash as an input bit, so the host stays authoritative. Not scheduled.

## Out of scope for the MVP

Killer powers, perks, progression, matchmaking, accounts, mobile, host migration, anti-cheat.

## Open decisions

- Final name.
- Standard Go vs TinyGo for WASM (bundle size). Start with standard Go, measure, then decide. Measured 2026-10-14 with Go 1.24.5: movement-only `sim.wasm` is 1.74 MB raw, 0.51 MB gzipped.
- Movement speed. First playtest (2026-10-14, dots page): stops, starts, and diagonals feel good, but both roles feel a little slow. Retune in `sim/config.go` once the map has obstacles.
