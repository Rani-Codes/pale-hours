# Live site

Anyone can open https://palehours.ranisaro.com and play. The page and the room-code signaling come from one Cloudflare Worker on one origin, so the page needs no `?signal=` query. A push to `main` redeploys it once CI passes. The lobby panel links the source code, as AGPL-3.0 requires.

## Sub-features

- `live-page` serves the Pale Hours page over HTTPS, with `/sim.wasm` returning 200.
- `live-signal` answers the room API on the same origin: joining a missing room returns 404.
- `live-link` connects two tabs through the live signaling.
- `live-source` shows `source code (AGPL-3.0)` in the lobby panel, linking to https://github.com/Rani-Codes/pale-hours.
- `live-feedback` shows `send feedback` in the lobby panel, opening the Feedback issue form on GitHub.
- `live-deploy` runs the CI workflow on a push to `main` and deploys only after the test job passes.

## How to get to it (user POV)

- Open https://palehours.ranisaro.com in a browser.

## Driving it with Playwright

Preconditions:

- The latest push to `main` shows a green `CI` run with a finished `deploy` job: `gh run list --workflow ci.yml --branch main --limit 1`.
- No local stack is needed. This drives production, so it creates real rooms on the live Worker. Each one closes when the driver exits.

- **Page and API.** Run `curl -sI https://palehours.ranisaro.com/sim.wasm | head -1` for `HTTP/2 200`, and `curl -s -o /dev/null -w '%{http_code}' -X POST https://palehours.ranisaro.com/rooms/0000/join` for `404`.
- **Link.** Run `node drive-link.mjs https://palehours.ranisaro.com/ <dir>/live-link | tee <dir>/live-link.log` from `tools/`. The log shows a room code, `connected to` with an rtt line on both tabs, and `errors: none`.
- **Source and feedback links.** Check `<dir>/live-link-host.png` for both links at the bottom of the lobby panel, or read `document.querySelector("#source").href` and `document.querySelector("#feedback").href`.
- **Deploy gate.** Read `gh run view <id>`. `deploy` lists `needs: test` and did not run on a run where `test` failed.

## Gotchas

- Both tabs in `drive-link.mjs` run on one machine, so this proves the live signaling, not NAT traversal between two homes. Players behind strict NATs still need TURN, which is not built.
- The free plan's Durable Object allowance resets at 00:00 UTC. Past it, room requests fail until the reset.
