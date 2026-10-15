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

// Master volume: the slider, or [ and ] (the mouse is captured while playing). Remembered per browser.
const volume = document.querySelector<HTMLInputElement>("#volume")!;
try {
  volume.value = localStorage.getItem("pale.volume") ?? String(audio.defaultVolume * 100);
} catch {
  volume.value = String(audio.defaultVolume * 100);
}
function applyVolume() {
  heartbeat.setVolume(Number(volume.value) / 100);
  try {
    localStorage.setItem("pale.volume", volume.value);
  } catch {
    // Private mode: the setting just does not persist.
  }
}
volume.addEventListener("input", applyVolume);
volume.addEventListener("change", () => volume.blur()); // keep WASD and the mouse for the game
addEventListener("keydown", (e) => {
  const step = e.code === "BracketRight" ? 10 : e.code === "BracketLeft" ? -10 : 0;
  if (!step || e.target instanceof HTMLInputElement) return;
  volume.value = String(Math.max(0, Math.min(100, Number(volume.value) + step)));
  applyVolume();
});
applyVolume();
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
  const { players, hud: lines, self, gens } = session.view(now, carry / tickMs);
  draw(players, lines, self, gens);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

const check = document.querySelector<HTMLDivElement>("#check")!;
const checkZone = document.querySelector<HTMLDivElement>("#check-zone")!;
const checkNeedle = document.querySelector<HTMLDivElement>("#check-needle")!;
const checkResult = document.querySelector<HTMLDivElement>("#check-result")!;

function draw(players: SimPlayer[], lines: string[], self: number | undefined, gens: number[]) {
  renderer.draw(players, gens, self, look.yaw, look.pitch);
  const me = players.find((p) => p.id === self);
  const killer = players.find((p) => p.role === sim.roles.killer);
  // Only survivors hear it. The killer does not hear his own heart.
  heartbeat.update(me && killer && me.role !== sim.roles.killer ? Math.hypot(killer.x - me.x, killer.y - me.y) / m : undefined);
  lines = [...lines, `volume ${volume.value}%` + (heartbeat.current.bpm > 0 ? `   heartbeat ${heartbeat.current.bpm.toFixed(0)} bpm` : "")];
  for (const p of players) {
    lines.push(`${p.role === sim.roles.killer ? "killer  " : "survivor"} ${p.id} ${fmt(p)}`);
  }
  const done = gens.filter((g) => g >= sim.genTicks).length;
  lines.push(`generators ${done}/${gens.length} done   ` + gens.map((g) => `${Math.floor((100 * Math.min(g, sim.genTicks)) / sim.genTicks)}%`).join(" "));
  const mine = players.find((p) => p.id === self);
  if (mine && mine.role === sim.roles.survivor) {
    const near = sim.genSites.some((s, i) => gens[i] < sim.genTicks && Math.hypot(s.x - mine.x, s.y - mine.y) <= sim.repairRange);
    if (near && !mine.repairing) lines.push("hold E to repair");
    if (mine.repairing && !mine.checkActive) lines.push("repairing...");
  }
  hud.textContent = lines.join("\n");

  // The skill check: a needle sweeps the bar, press Space while it is in the bright zone.
  check.style.display = mine?.checkActive ? "block" : "none";
  if (mine?.checkActive) {
    const span = sim.check.duration;
    checkZone.style.left = `${(100 * mine.checkZone) / span}%`;
    checkZone.style.width = `${(100 * sim.check.zoneLen) / span}%`;
    checkNeedle.style.left = `${(100 * Math.min(mine.checkAge, span)) / span}%`;
  }
  // The last result lingers on screen until the next check begins.
  checkResult.textContent = mine?.checkActive ? "" : mine?.checkResult === 1 ? "good" : mine?.checkResult === 2 ? "missed" : "";
}

function fmt(p: SimPlayer): string {
  return `x ${(p.x / m).toFixed(2).padStart(6)} m   y ${(p.y / m).toFixed(2).padStart(6)} m`;
}
