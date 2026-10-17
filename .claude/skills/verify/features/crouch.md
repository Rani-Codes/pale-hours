# Crouch and tall grass

Hold C to crouch. A crouched survivor walks slowly and cannot repair, open a gate, help or vault. Crouched and still inside one of the six tall grass patches for half a second, they are hidden (moving shows them at once): the killer's screen does not draw them and his HUD list says "out of sight", unless he is within 5 m. A hit, being downed, carried or hooked, or standing up ends it.

## Sub-features

- `crouch-hide` settles a crouched survivor in grass into hiding, host and guest agreeing with no corrections, and tells them "hidden".
- `crouch-far` hides them from a killer 10 m off: his HUD says "out of sight".
- `crouch-move` shows them the moment they move in the grass, and hides them again after half a second still.
- `crouch-close` shows them to a killer within 5 m.
- `crouch-stand` shows them again once C is released.
- `crouch-open` hides nobody crouched outside grass.
- `crouch-slow` walks a crouched survivor at about 0.4 of normal speed.

## How to get to it (user POV)

- Host as killer, join as survivor, walk to a grass patch (for example x 4..10, y 8..14 m, east of the centre wall), hold C.

## Driving it with Playwright

- **Full check.** Run `node drive-crouch.mjs "$APP" <dir>/crouch "delay=100&loss=0.05" | tee <dir>/crouch.log`. Repeat with `delay=200&loss=0.05` and no query.
- Setup places both players with `paleSim.load`. C and W are real keys. It writes `crouch-killer-far.png`, `crouch-survivor-hidden.png` and `crouch-killer-close.png`.

## Gotchas

- Unit tests set `Grass` with `withGrass`; the real patches are checked by `TestGrassLayout` against walls, generators, hooks and each other.
- A stalled guest input keeps the last crouch state, so a late packet does not drop cover.
- The renderer asks `paleSim.concealed` whether the killer can see a survivor; the HUD list uses it too.
