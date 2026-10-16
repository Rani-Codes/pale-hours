# Lobby

The page opens on a lobby panel over the map. One player creates a room and shares its four-letter code; others join with it. Each player picks Killer or Survivor (one killer, up to four survivors). The creator's Start button appears, enabled once there are two or more players, all picked, with one killer and at least one survivor. Start puts everyone in the match; anyone joining later is refused with a reason. The creator's browser runs the match whichever role they play.

## Sub-features

- `lobby-start` shows Start only on the host, disabled until the lobby is valid.
- `lobby-one-killer` greys out Killer for others once taken, and the host refuses a second killer even if asked.
- `lobby-roles` starts the match with each tab's picked role in the sim.
- `lobby-late` refuses a joiner after Start with "the match has already started".
- `lobby-guest-killer` lets a guest play killer: his movement predicts with no corrections and his swing lands, judged with the view lag from his `seen` field (capped at 200 ms by the sim).
- `lobby-host-survivor` lets the host play a survivor on its own keys.

## How to get to it (user POV)

- Open the page, click Create room, share the code. Others type it and click Join. Everyone clicks Play killer or Play survivor; the creator clicks Start.

## Driving it with Playwright

- **Full check.** Run `node drive-lobby.mjs "$APP" <dir>/lobby "delay=100&loss=0.05" | tee <dir>/lobby.log`. The JSON line includes the guest killer's `viewLagMs`. Repeat with `delay=50&loss=0.05` and no query.
- Other drivers enter the match with `startMatch(host, guests, { killer })` from `tools/lib/lobby.mjs`.

## Gotchas

- `#room` is `display: flex`; it needs an explicit `#room[hidden]` rule or it stays over the canvas and swallows clicks.
- The panel redraws every frame. Poll for a button's state after a lobby change instead of reading it once.
- The latency matrix's join time now includes picking roles and Start (about a second more).
