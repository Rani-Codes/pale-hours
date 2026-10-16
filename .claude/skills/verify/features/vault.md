# Vaults

Windows are waist-high walls that block walking. A survivor beside one sees "Space to vault" and goes over it in 0.6 s. The killer cannot vault and has to go around, but his swing reaches across.

## Sub-features

- `vault-offer` shows "Space to vault" in the survivor's HUD beside a window.
- `vault-cross` lands the survivor just past the far face, host and guest agreeing exactly with no corrections.
- `vault-block` stops a survivor who walks into a window without Space.
- `vault-killer` stops the killer: he cannot walk through and Space does nothing.
- `vault-swing` lets the killer's swing reach a survivor across the window.

## How to get to it (user POV)

- Host, join from another tab, walk the survivor to a window (the loop west of the centre at x = -4 m, or either building's side window) and press Space.

## Driving it with Playwright

- **Full check.** Run `node drive-vault.mjs "$APP" <dir>/vault "delay=100&loss=0.05" | tee <dir>/vault.log`. Repeat with `delay=50&loss=0.05` and no query.
- Setup places both players with `paleSim.load` and turns them with `paleLook`. Movement, Space and the swing are real.

## Gotchas

- Unit tests use `withMap`, which also clears `Vaults`. A test that needs one sets `Vaults` itself.
- `paleSim.canVault(x, y)` is the sim's own position test, for the HUD and tools.
