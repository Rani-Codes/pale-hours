# Killer attack

The killer left-clicks to swing. The killer's arm goes up for 0.2 s, then the host checks a forward cone from where the killer faces. A survivor in reach goes from healthy to injured (and is shoved forward about 2.2 m), or from injured to downed. A downed survivor lies low, crawls slowly, and cannot be hit again. The survivor's screen flashes red on every hit. The host decides every hit, judged against survivors where the killer's own screen last drew them.

## Sub-features

- `attack-hit` injures a healthy survivor standing in front of the killer, on both tabs.
- `attack-down` downs an injured survivor with a second hit, on both tabs.
- `attack-downed-immune` leaves a downed survivor downed when swung at again.
- `attack-crawl` moves a downed survivor at crawl speed (0.7 m/s), host and guest agreeing.
- `attack-lagcomp` judges every swing against the survivor's position on the killer's last drawn frame (via `paleSim.inReach`), including swings aimed at the cone edge where the landing-tick position would give the other answer.
- `attack-guest-cue` flashes the guest's screen once per hit (`paleHitsSeen.hits` equals the host's hits on that guest).

## How to get to it (user POV)

- Host in one tab, join from another. On the host, walk the killer up to the survivor and left-click the game view. The HUD names each survivor's health; the killer's HUD says `swinging...`, then `HIT` or `missed`.

## Driving it with Playwright

Preconditions:

- Doctor passes. Two fresh tabs with the same network query.

- **Full check.** Run `node drive-attack.mjs "$APP" <dir>/attack "delay=100&loss=0.05" | tee <dir>/attack.log`. Each sub-feature appears as a `PASS` line. The sweep section lists every swing with the view lag, where the killer saw the survivor, where they were on the landing tick, and which swings rewind decided.
- **Both latencies.** Repeat with `delay=50&loss=0.05`, and once with no query.
- Handles: `paleSession.swings` on the host logs each resolved swing (`{tick, hit, viewLagMs, killer, drawn, now}`). `paleSim.inReach(x, y, yaw, tx, ty)` runs the sim's own reach test. `paleHitsSeen.hits` on the guest counts the red flashes.

## Gotchas

- Setup places players with `paleSim.load` on the host. Delete `trail` from a player you move, or the first swings rewind into their old spot.
- The killer hosts, so the view lag is the host's render gap, about 33 to 50 ms whatever the network query. Network delay changes what the guest sees, not what the killer is judged on.
- Clicking the canvas also asks for pointer lock. A background tab refuses it; `look.ts` swallows the refusal.
- A hit shoves the survivor forward, which shows up as one correction on the guest. Do not add a zero-corrections check to this driver.
