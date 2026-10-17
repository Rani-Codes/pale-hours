# Pallets

Six wooden pallets, each hinged to a brick wall, stand in the building doorways and at the ends of two loose walls. Thrown down, a pallet tips over sideways across the gap. A survivor within 1.5 m presses Space to throw one down, once. It blocks everyone and survivors can vault it. A killer within 3 m when it falls is stunned for 3 s. The killer breaks a dropped pallet by holding E beside it for 3 s.

## Sub-features

- `pallet-walk` lets the killer through a standing pallet.
- `pallet-throw` shows "Space to throw down the pallet", drops it on both tabs and stuns the killer two metres behind for 3 s: he cannot move, then can.
- `pallet-block` stops the killer at a dropped pallet.
- `pallet-break` counts "breaking the pallet: N s" while E is held, breaks it on both tabs after 3 s, and lets him through.
- `pallet-once` leaves a broken pallet broken; Space does nothing.
- `pallet-vault` offers "Space to vault" at a dropped pallet and lands the survivor past it, host and guest agreeing with no corrections.

## How to get to it (user POV)

- Host, join from another tab, pick killer and survivor, Start. Walk the survivor to a doorway of a brick building (building A's doorways are at (-18, 20) and (-15, 8)) and press Space with the killer behind.

## Driving it with Playwright

- **Full check.** Run `node drive-pallet.mjs "$APP" <dir>/pallet "delay=100&loss=0.05" | tee <dir>/pallet.log`. Repeat with `delay=50&loss=0.05` and no query. Screenshots show the stunned killer, the survivor's view, the break in progress, and the vault.
- Setup places both players and the pallet state with `paleSim.load`; Space, E and movement are real keys. `paleSim.palletSites`, `paleSim.state().pallets` (0 standing, 1 down, 2 broken) and `palletBreak` read the state.

## Gotchas

- Unit tests use `withPallets` in `sim/pallet_test.go`, which swaps `PalletSites`; `withMap` does not touch them.
- A vault needs the survivor within a metre of the pallet; throwing works from 1.5 m.
- A killer who pressed E the same tick spent it on the press, so breaking starts the tick after.
