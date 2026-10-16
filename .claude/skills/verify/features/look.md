# Look

The game renders at 240 rows and stretches that over the window with hard pixels, banded color and an ordered dither; vertices snap to the pixel grid. Walls are brick, the floor dirt, generators rusted engines with pumping pistons, hooks wooden gallows, gates concrete pillars with a rising portcullis. Survivors and the killer are animated low-poly models; the killer sees his own cleaver in first person. Fence, pines, rocks and grass dress the field.

## Sub-features

- `look-retro` draws the low-res, dithered image with no colored speckle (a texture bug once produced it).
- `look-world` shows walls, generators, hooks, gates and dressing at the fixed spots in `drive-look.mjs`.
- `look-survivor` poses survivors for walking, limping injured, kneeling at work, crawling downed, carried and hooked.
- `look-killer` poses the killer idle, walking, winding up, striking, carrying, and shows the first-person cleaver swing.
- `look-perf` keeps 60 frames per second in headless Chrome in a two-tab match.

## How to get to it (user POV)

- Start a match. The killer sees in first person, survivors in third person. `&light=review` in the URL lights everything and drops the fog, for judging models.

## Driving it with Playwright

- **World and survivors.** `node drive-look.mjs "$APP" <dir>/look` writes one screenshot per spot and prints `fps`. Read the screenshots: proof here is looking, not a PASS line.
- **Killer and animations.** `node drive-look-killer.mjs "$APP" <dir>/killer` writes idle, windup, strike, fp-windup, fp-strike, walk, crawl, carry, repair and limp shots from a third tab's camera.
- Gameplay drivers must still pass after any art change; they fail on page errors.

## Gotchas

- A guest sees the killer through the interpolation delay. Time swing shots off the camera tab's own view (`paleSession.view(...)`), never a fixed sleep after the click.
- `Object3D.add()` returns the parent. `head.add(eye).position.x = ...` moves the head.
- Painters in `textures.ts` pass fractional coordinates; the pixel writer floors them. Without that, writes land mid-pixel and smear color across channels.
- `paleLook` sets where a tab looks; headless Chrome cannot capture the mouse.
- The renderer compiles every shader at startup. Remove that and the first sight of a model can stall the host's tick loop.
