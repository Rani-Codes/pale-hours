import { net } from "./config";
import { hostRoom, joinRoom, type Link } from "./net";

// Lobby UI plus a ping over both channels, so each tab can see the link work.
// This is a connectivity check only; game traffic arrives in later items.
const status = document.querySelector<HTMLDivElement>("#netstatus")!;
const codeInput = document.querySelector<HTMLInputElement>("#code")!;
const rtt = { events: NaN, state: NaN };
let lines = ["offline"];

function render() {
  status.textContent = lines.concat(
    Number.isNaN(rtt.events) ? [] : [`rtt reliable ${rtt.events.toFixed(1)} ms   unreliable ${rtt.state.toFixed(1)} ms`],
  ).join("\n");
}

function say(...text: string[]) {
  lines = text;
  render();
}

function wirePing(link: Link) {
  for (const name of ["events", "state"] as const) {
    const ch = link[name];
    ch.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.ping !== undefined) ch.send(JSON.stringify({ pong: msg.ping }));
      else if (msg.pong !== undefined) {
        rtt[name] = performance.now() - msg.pong;
        render();
      }
    };
  }
  setInterval(() => {
    for (const name of ["events", "state"] as const) {
      if (link[name].readyState === "open") link[name].send(JSON.stringify({ ping: performance.now() }));
    }
  }, net.pingIntervalMs);
}

const handlers = {
  onLink(link: Link) {
    say(`connected to ${link.peerId}`);
    wirePing(link);
  },
  onClosed(reason: string) {
    say(
      `disconnected: ${reason}`,
      "no direct path to the other player. Check:",
      "  macOS: System Settings > Privacy & Security > Local Network > Chrome on",
      "  turn off any VPN, then reload both tabs",
    );
  },
};

document.querySelector("#host")!.addEventListener("click", async () => {
  try {
    say("creating room…");
    const room = await hostRoom(handlers);
    say(`hosting room ${room.code} — waiting for a guest`);
  } catch (err) {
    say(`host failed: ${err}`);
  }
});

document.querySelector("#join")!.addEventListener("click", async () => {
  try {
    say("joining…");
    await joinRoom(codeInput.value, handlers);
    say("joined — connecting…");
  } catch (err) {
    say(`join failed: ${err}`);
  }
});
