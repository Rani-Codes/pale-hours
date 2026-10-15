# Room link

One player clicks Host and gets a 4-character room code. Another types the code and clicks Join. While the guest connects, its status line shows the connection stage and the seconds elapsed. Once linked, both tabs show the round trip on the reliable and unreliable channels.

## Sub-features

- `link-host` shows `hosting room ABCD` after Host is clicked.
- `link-join` connects a guest that enters the code.
- `link-progress` shows `connecting: <stage> (n.n s)` on the guest while it connects.
- `link-rtt` shows `rtt reliable … ms   unreliable … ms` on both tabs.
- `link-fail-hint` shows the macOS Local Network and VPN hint when the connection fails.

## How to get to it (user POV)

- Click `Host` in the top-right lobby.
- Type the code into the `CODE` box and click `Join` in a second tab.

## Driving it with Playwright

Preconditions:

- Doctor passes. Two fresh tabs.

- **Host and join.** Run `node drive-link.mjs "$APP" <dir>/link | tee <dir>/link.log`. The log shows the room code, `connected to` with an rtt line on both tabs, and `errors: none`. The screenshots `link-host.png` and `link-guest.png` show the status lines.
- **Join progress.** No driver covers this yet. After clicking Join, `page.waitForFunction(() => /connecting:/.test(document.querySelector("#netstatus").textContent))` usually catches it, but in automation the stage lasts only about 0.2 s, so that check is racy.
- **Failure hint.** No driver covers this. It needs a network where ICE fails.

## Gotchas

- Without `--disable-features=WebRtcHideLocalIpsWithMdns`, two automated tabs never connect.
- On the user's real Chrome, macOS must allow Chrome under System Settings > Privacy & Security > Local Network.
- A peer that creates or joins a room but does not open its event stream within 30 s is removed. For a host, that closes the room. A driver that pauses between Host and connecting for longer than that will find the room gone.
- The `delay` query applies only after the link opens, so it cannot slow joining.
- A room holds at most 5 players.
