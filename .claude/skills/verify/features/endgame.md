# Match end

The match ends when every survivor has escaped or died. Every tab shows an end screen that speaks to its player ("You escaped", "You died", "You killed 1 of 2") and lists how each survivor finished. The match freezes, and the host gets a Rematch button. A survivor who is out spectates someone still in play. The heartbeat stays silent while a survivor is carried, hooked, or out.

## Sub-features

- `end-heartbeat` plays the heartbeat beside the killer and silences it on the hook (and when carried, which the client unit test covers).
- `end-spectate` follows a survivor still in play after escaping; Space switches to the next (`paleSpectate.id`).
- `end-over` sets `over` on every tab when the last survivor dies or escapes.
- `end-screens` shows each tab's own headline in `#result-headline`.
- `end-freeze` ignores input once the match is over.
- `end-rematch` shows Rematch only on the host; clicking it respawns everyone with a fresh match on every tab.

## How to get to it (user POV)

- Host, two guests join. One walks out down the lane behind an open gate; the other dies on a hook. The end screen appears on all three tabs; the host clicks Rematch.

## Driving it with Playwright

Preconditions:

- Doctor passes. Three fresh tabs with the same network query.

- **Full check.** Run `node drive-endgame.mjs "$APP" <dir>/endgame "delay=100&loss=0.05" | tee <dir>/endgame.log`. Each sub-feature appears as a `PASS` line after a JSON summary. Repeat with `delay=50&loss=0.05` and no query.
- Setup uses `paleSim.load` on the host to power and open the north gate, hang a survivor with 8 s of hook time left, and place players. The walk out, Space, and the Rematch click are real.

## Gotchas

- Do not edit client files while a driver runs: Vite reloads the tabs and the match is lost. One run failed this way (the match never ended), so the driver prints `NOT OVER` with the host state when it times out.
- `paleHeartbeat.current.bpm` is the beat the tab wants, independent of whether audio is unlocked.
