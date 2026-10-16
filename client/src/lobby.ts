import { lagSim, net } from "./config";
import { hostRoom, joinRoom, type Link } from "./net";
import { parsePing } from "./protocol";
import type { Role } from "./room";
import type { RoomView } from "./session";

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

/** What the lobby needs from the game: start a mode, get back what to do with each link; pass on picks and Start. */
export interface Game {
  host(): (link: Link) => void;
  join(): (link: Link) => void;
  pick(role: Role): void;
  start(): void;
}

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const panel = { root: $("#room"), entry: $("#room-entry"), code: $("#room-code"), seats: $("#room-seats"), picks: $("#room-picks"), start: $<HTMLButtonElement>("#start"), status: $("#room-status") };
const pickButtons = { killer: $<HTMLButtonElement>("#pick-killer"), survivor: $<HTMLButtonElement>("#pick-survivor") };
const codeLabel = $("#room-code-label");
const codeText = $("#room-code-text");
const copyButton = $<HTMLButtonElement>("#copy-code");
let roomCode: string | undefined;
let entryNote = "";

/** Show the room as the session sees it. Called every frame; hides the panel once the match is on. */
export function renderRoom(view: RoomView | undefined) {
  panel.root.hidden = !!view?.started;
  if (view?.started) return;
  const inRoom = !!view && view.you !== 0 && !view.refused;
  panel.entry.hidden = inRoom;
  for (const el of [panel.code, panel.seats, panel.picks]) el.hidden = !inRoom;
  panel.start.hidden = !inRoom || !view.isHost;
  if (!inRoom) {
    panel.status.textContent = view?.refused ? `refused: ${view.refused}` : entryNote;
    return;
  }
  codeLabel.textContent = view.isHost ? "room code" : "in the room";
  codeText.textContent = view.isHost ? (roomCode ?? "") : "";
  codeText.hidden = copyButton.hidden = !view.isHost || !roomCode;
  panel.seats.textContent = view.seats
    .map((s) => `player ${s.id}${s.id === view.you ? " (you)" : ""}${s.id === 1 ? " host" : ""}`.padEnd(22) + (s.role ?? "picking…"))
    .join("\n");
  const mine = view.seats.find((s) => s.id === view.you)?.role;
  const killerTaken = view.seats.some((s) => s.role === "killer" && s.id !== view.you);
  pickButtons.killer.classList.toggle("chosen", mine === "killer");
  pickButtons.survivor.classList.toggle("chosen", mine === "survivor");
  pickButtons.killer.disabled = killerTaken;
  panel.start.disabled = !!view.problem;
  panel.status.textContent = view.problem ?? (view.isHost ? "ready: press Start" : "ready: waiting for the host to start");
}

export function initLobby(game: Game) {
  pickButtons.killer.addEventListener("click", () => game.pick("killer"));
  pickButtons.survivor.addEventListener("click", () => game.pick("survivor"));
  panel.start.addEventListener("click", () => game.start());
  const copyCode = async () => {
    if (!roomCode) return;
    try {
      await navigator.clipboard.writeText(roomCode);
      copyButton.textContent = "Copied";
    } catch {
      const range = document.createRange();
      range.selectNodeContents(codeText);
      getSelection()?.removeAllRanges();
      getSelection()?.addRange(range);
      copyButton.textContent = "Press Ctrl/Cmd+C";
    }
    setTimeout(() => (copyButton.textContent = "Copy"), 1500);
  };
  copyButton.addEventListener("click", copyCode);
  codeText.addEventListener("click", copyCode);
  let joinTimer: ReturnType<typeof setInterval> | undefined;
  const stopJoinTimer = () => clearInterval(joinTimer);

  const handlers = (onLink: (link: Link) => void) => ({
    onLink(link: Link) {
      stopJoinTimer();
      say(`connected to ${link.peerId}`);
      wirePing(link);
      onLink(link);
    },
    onClosed(reason: string) {
      stopJoinTimer();
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
      roomCode = room.code;
      say(`hosting room ${room.code} — waiting for a guest`);
    } catch (err) {
      say(`host failed: ${err}`);
      entryNote = `could not create a room: ${err}`;
    }
  });

  codeInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.repeat && codeInput.value.trim()) document.querySelector<HTMLButtonElement>("#join")!.click();
  });

  document.querySelector("#join")!.addEventListener("click", async () => {
    try {
      const start = performance.now();
      let stage = "waiting for the host's offer";
      const show = () => say(`connecting: ${stage} (${((performance.now() - start) / 1000).toFixed(1)} s)`);
      show();
      joinTimer = setInterval(show, 250);
      await joinRoom(codeInput.value, {
        ...handlers(game.join()),
        onProgress(s: string) {
          stage = s;
          show();
        },
      });
    } catch (err) {
      stopJoinTimer();
      say(`join failed: ${err}`);
      entryNote = `could not join: ${err}`;
    }
  });
}
