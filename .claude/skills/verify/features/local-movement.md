# Local movement

Before hosting or joining, the page runs both players in one tab. The killer (red, larger) moves with WASD and the survivor (pale) with the arrow keys, at a fixed 30 ticks per second, on a 60 m square map with a 5 m grid.

## Sub-features

- `local-move` moves each player at its role's speed while a key is held.
- `local-diagonal` caps diagonal movement at full speed.
- `local-edge` stops players at the map edge.

## How to get to it (user POV)

- Open the page and press keys without clicking Host or Join.

## Driving it with Playwright

Preconditions:

- Doctor passes. The tab has not clicked Host or Join.

- **Move both players.** Hold D and ArrowUp for one second. Run `node drive-dots.mjs "$APP" <dir>/dots.png | tee <dir>/dots.log`. The log shows the killer moving east about 0.153 m per tick and the survivor north about 0.133 m per tick, then `PASS`.
- **Diagonal and edge.** No driver covers these yet. Hold W and D together and compare `paleSim.state()` before and after against `sim/step_test.go`. Then hold one direction for 10 s and confirm the coordinate stops at 30 m.

## Gotchas

- Keys can go down and up between ticks, so allow two ticks of slack.
- The first frames after page load run slowly in headless Chrome. Wait for tick 30 before measuring.
