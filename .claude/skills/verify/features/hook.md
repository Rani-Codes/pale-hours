# Downed, carry and hook

A downed survivor lies on the ground. A teammate holding E beside them gets a skill check almost at once, and a good one stands them up injured. Left alone for 60 s they get up by themselves. The killer presses E to pick a downed survivor up, carries them slowly, and presses E by a hook to hang them, or elsewhere to drop them. A teammate holding E at the hook for a second frees them, injured. Each survivor has 60 s of hook time in total; when it runs out they are eliminated. When someone is hung, the other survivors see where for 3 s. Every survivor sees their health as two squares at the bottom of the screen.

## Sub-features

- `hook-help` stands a downed survivor up injured when a teammate hits the help check, on every tab.
- `hook-health-bar` shows 2, 1 or 0 filled squares (`#health .pip.full`) for healthy, injured, and downed, carried or hooked.
- `hook-carry` picks a downed survivor up with E; they ride at the killer's position on every tab. The killer's own camera pulls back to third person while he carries (`render.ts` `firstPerson`) and a `#carry` banner names who is on his shoulder. A hooked survivor gets a panel to wriggle off with E (10% a try, 2 tries): the driver checks the panel, a pip spent with a shake and a note on a failed try, and that no tries left means none. The luck is in the sim's unit tests. A carried survivor alternating E and Q (real keys) takes 1 s off per press; `hook-struggle` checks mashing one key does nothing, alternating frees them in seconds with the killer stunned 1.5 s. The downed survivor's HUD counts down the seconds until they get up on their own.
- `hook-hang` hangs the carried survivor on a free hook in range with a second E.
- `hook-alert` shows the other survivor `TEAMMATE HOOKED` with distance and bearing, and a red beam over the hook, for 3 s; the hooked survivor and the killer get nothing.
- `hook-checks` gives a hooked survivor skill checks: a timeout costs exactly 5 s of hook time, a good press costs nothing, and the guest agrees.
- `hook-break-free` lets a survivor carried until their get-up timer fills break free injured, and stuns the killer for 1 s (frozen, then moving).
- `hook-rescue` unhooks a survivor injured after a teammate holds E for 1 s, keeping their hook time used.
- `hook-death` eliminates a survivor whose hook time runs out, on every tab, and tells them.
- `hook-recover` stands a downed survivor up injured after 60 s alone.

## How to get to it (user POV)

- Host, then join from two more tabs. Down a survivor with two left clicks. A teammate holds E beside them, or the killer presses E to pick them up and walks to a pale post with an arm (a hook).

## Driving it with Playwright

Preconditions:

- Doctor passes. Three fresh tabs with the same network query.

- **Full check.** Run `node drive-hook.mjs "$APP" <dir>/hook "delay=100&loss=0.05" | tee <dir>/hook.log`. The first line is a JSON summary with each tab's view of the survivor; each sub-feature appears as a `PASS` line. Repeat with `delay=50&loss=0.05` and with no query.
- Setup uses `paleSim.load` on the host to place players, down a survivor, fast-forward the 60 s hook and recovery timers, and bring the next hook skill check close (`checkIn`). E, Space and movement are real keys.

## Gotchas

- `keyboard.press` is shorter than a tick. `keys.ts` latches an E tap for one tick so it still counts; if a pickup stops working, check that first.
- A carried guest is moved by the killer, so its own tab counts a correction most ticks while carried. Do not add a zero-corrections check here.
- A guest predicts itself a few ticks ahead of the host. Wait for a check to start on the host, require `checkActive` before timing a press on the guest, and compare hook time net of the tick (`hookUsed - tick`).
- Hook numbers in `onHook` are the hook index plus one; `paleSim.hookSites[2]` is hook 3.
