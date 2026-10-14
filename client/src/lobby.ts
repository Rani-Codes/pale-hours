import { lagSim, net } from "./config";
import { hostRoom, joinRoom, type Link } from "./net";
import { parsePing } from "./protocol";

// Lobby UI plus a ping over both channels, so each tab shows the link's round trip.
const status = document.querySelector<HTMLDivElement>("#netstatus")!;
const codeInput = document.querySelector<HTMLInputElement>("#code")!;
const rtt = { events: NaN, state: NaN };
let lines = ["offline"];

const lagNote =
  lagSim.delayMs || lagSim.jitterMs || lagSim.loss
    ? [`simulating ${lagSim.delayMs} ms delay, ${lagSim.jitterMs} ms jitter, ${lagSim.loss * 100}% loss on send`]
    : [];

function render() {
  status.textContent = [...lagNote, ...lines].concat(
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
    ch.onMessage((m) => {
      const msg = parsePing(m);
      if (msg?.t === "ping") ch.send({ t: "pong", at: msg.at });
      else if (msg?.t === "pong") {
        rtt[name] = performance.now() - msg.at;
        render();
      }
    });
  }
  const timer = setInterval(() => {
    for (const name of ["events", "state"] as const) link[name].send({ t: "ping", at: performance.now() });
  }, net.pingIntervalMs);
  link.onClose(() => clearInterval(timer));
}

/** What the lobby needs from the game: start a mode, get back what to do with each link. */
export interface Game {
  host(): (link: Link) => void;
  join(): (link: Link) => void;
}

export function initLobby(game: Game) {
  const handlers = (onLink: (link: Link) => void) => ({
    onLink(link: Link) {
      say(`connected to ${link.peerId}`);
      wirePing(link);
      onLink(link);
    },
    onClosed(reason: string) {
      say(
        `disconnected: ${reason}`,
        "no direct path to the other player. Check:",
        "  macOS: System Settings > Privacy & Security > Local Network > Chrome on",
        "  turn off any VPN, then reload both tabs",
      );
    },
  });

  document.querySelector("#host")!.addEventListener("click", async () => {
    try {
      say("creating room…");
      const room = await hostRoom(handlers(game.host()));
      say(`hosting room ${room.code} — waiting for a guest`);
    } catch (err) {
      say(`host failed: ${err}`);
    }
  });

  document.querySelector("#join")!.addEventListener("click", async () => {
    try {
      say("joining…");
      await joinRoom(codeInput.value, handlers(game.join()));
      say("joined — connecting…");
    } catch (err) {
      say(`join failed: ${err}`);
    }
  });
}
