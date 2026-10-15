# Downed, carry and hook

A downed survivor lies on the ground. A teammate holding E beside them gets a skill check almost at once, and a good one stands them up injured. Left alone for 60 s they get up by themselves. The killer presses E to pick a downed survivor up, carries them slowly, and presses E by a hook to hang them, or elsewhere to drop them. A teammate holding E at the hook for a second frees them, injured. Each survivor has 60 s of hook time in total; when it runs out they are eliminated. Every survivor sees their health as two squares at the bottom of the screen.

## Sub-features

- `hook-help` stands a downed survivor up injured when a teammate hits the help check, on every tab.
- `hook-health-bar` shows 2, 1 or 0 filled squares (`#health .pip.full`) for healthy, injured, and downed, carried or hooked.
- `hook-carry` picks a downed survivor up with E; they ride at the killer's position on every tab.
- `hook-hang` hangs the carried survivor on a free hook in range with a second E.
- `hook-rescue` unhooks a survivor injured after a teammate holds E for 1 s, keeping their hook time used.
- `hook-death` eliminates a survivor whose hook time runs out, on every tab, and tells them.
- `hook-recover` stands a downed survivor up injured after 60 s alone.

## How to get to it (user POV)

- Host, then join from two more tabs. Down a survivor with two left clicks. A teammate holds E beside them, or the killer presses E to pick them up and walks to a pale post with an arm (a hook).

## Driving it with Playwright

Preconditions:

- Doctor passes. Three fresh tabs with the same network query.

- **Full check.** Run `node drive-hook.mjs "$APP" <dir>/hook "delay=100&loss=0.05" | tee <dir>/hook.log`. The first line is a JSON summary with each tab's view of the survivor; each sub-feature appears as a `PASS` line. Repeat with `delay=50&loss=0.05` and with no query.
- Setup uses `paleSim.load` on the host to place players, down a survivor, and fast-forward the 60 s hook and recovery timers. E, Space and movement are real keys.

## Gotchas

- `keyboard.press` is shorter than a tick. `keys.ts` latches an E tap for one tick so it still counts; if a pickup stops working, check that first.
- A carried guest is moved by the killer, so its own tab counts a correction most ticks while carried. Do not add a zero-corrections check here.
- Hook numbers in `onHook` are the hook index plus one; `paleSim.hookSites[2]` is hook 3.
