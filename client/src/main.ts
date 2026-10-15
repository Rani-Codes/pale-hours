import { initLobby } from "./lobby";
import { GuestSession, HostSession, LocalSession, type Session } from "./session";
import { audio } from "./config";
import { Heartbeat } from "./heartbeat";
import { look, initLook } from "./look";
import { Renderer } from "./render";
import { loadSim, type SimPlayer } from "./sim";

const m = 1_000_000; // micrometers per meter

const canvas = document.querySelector<HTMLCanvasElement>("#view")!;
const hud = document.querySelector<HTMLDivElement>("#hud")!;
const sim = await loadSim("/sim.wasm");
const renderer = new Renderer(canvas, sim);
initLook(canvas);
const heartbeat = new Heartbeat(audio.heartbeat);
// Exposed for the tools/ drivers.
(globalThis as { paleHeartbeat?: Heartbeat }).paleHeartbeat = heartbeat;
for (const type of ["pointerdown", "keydown"]) addEventListener(type, () => heartbeat.unlock());
addEventListener("keydown", (e) => {
  if (e.code === "KeyM" && !(e.target instanceof HTMLInputElement)) renderer.showMap = !renderer.showMap;
});
let session: Session;
// Exposed for the tools/ drivers.
function use(s: Session) {
  session = s;
  (globalThis as { paleSession?: Session }).paleSession = s;
}
use(new LocalSession(sim));

initLobby({
  host() {
    const host = new HostSession(sim);
    use(host);
    return (link) => host.addGuest(link);
  },
  join() {
    return (link) => use(new GuestSession(sim, link));
  },
});

const tickMs = 1000 / sim.tickRate;
let carry = 0;
let last = performance.now();

function frame(now: number) {
  carry += Math.min(now - last, 250);
  last = now;
  while (carry >= tickMs) {
    session.tick();
    carry -= tickMs;
  }
  session.flush?.();
  const { players, hud: lines, self } = session.view(now, carry / tickMs);
  draw(players, lines, self);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function draw(players: SimPlayer[], lines: string[], self: number | undefined) {
  renderer.draw(players, self, look.yaw, look.pitch);
  const me = players.find((p) => p.id === self);
  const killer = players.find((p) => p.role === sim.roles.killer);
  // Only survivors hear it. The killer does not hear his own heart.
  heartbeat.update(me && killer && me.role !== sim.roles.killer ? Math.hypot(killer.x - me.x, killer.y - me.y) / m : undefined);
  lines = [...lines, heartbeat.current.bpm > 0 ? `heartbeat ${heartbeat.current.bpm.toFixed(0)} bpm` : ""];
  for (const p of players) {
    lines.push(`${p.role === sim.roles.killer ? "killer  " : "survivor"} ${p.id} ${fmt(p)}`);
  }
  hud.textContent = lines.join("\n");
}

function fmt(p: SimPlayer): string {
  return `x ${(p.x / m).toFixed(2).padStart(6)} m   y ${(p.y / m).toFixed(2).padStart(6)} m`;
}
