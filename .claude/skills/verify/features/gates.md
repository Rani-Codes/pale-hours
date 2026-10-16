# Exit gates

Two gates sit in the fence on the north and south edges of the map. Shut, a gate blocks its opening like the fence beside it, so nobody can get behind it. Once four generators are done, a survivor holds E at a gate to open it: 7.5 s of work, with skill checks every 2 to 3 s (a hit adds 0.5 s, a miss or letting go takes 1.5 s off). An open gate does not end anything by itself. Behind it is a walled exit lane, and a survivor escapes only after walking 4 m down it. The killer never gets past the gate line.

## Sub-features

- `gates-shut` stops a survivor walking into a shut gate on the near side (y 29.35 m for the north gate).
- `gates-unpowered` leaves the gate at 0 while fewer than four generators are done, even with E held.
- `gates-checks` brings at least two skill checks while opening; every hit lands, and opening still takes over 6 s.
- `gates-open` opens the gate fully on the host.
- `gates-not-out` keeps the survivor in play right after the gate opens.
- `gates-walk-out` escapes the survivor on host and guest only once they are 4 m past the gate line, with no corrections.

## How to get to it (user POV)

- Create a room, join from a second tab, pick killer and survivor, Start. As the survivor walk north to the gate in the fence. Finishing four generators by hand takes minutes; the driver powers the gates instead.

## Driving it with Playwright

Preconditions:

- Doctor passes. Two fresh tabs with the same network query.

- **Full check.** Run `node drive-gates.mjs "$APP" <dir>/gates "delay=100&loss=0.05" | tee <dir>/gates.log`. The summary lines give where the survivor parked and was stopped, how long opening took with which check results, and where the host saw them escape. Repeat with no query.
- Setup marks four generators done through `paleSim.load` on the host. Walking, E and Space are real keys; each Space is pressed once the predicted needle is one tick into the zone.

## Gotchas

- `Fences` and `Lanes` in `sim/map.go` are computed from `GateSites`. A test that moves the gates calls `edges` again; `withGate` does.
- The fence is now the map edge players stop at: 29.35 m from the centre, not the 30 m clamp.
- Only the lane walls render as walls (`paleSim.lanes`); the fence collision boxes are drawn by the dressing fence in `client/src/art/dressing.ts`, which must stay on the same line.
