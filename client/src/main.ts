import { initLobby } from "./lobby";
import { GuestSession, HostSession, LocalSession, type Session } from "./session";
import { audio } from "./config";
import { Heartbeat } from "./heartbeat";
import { look, initLook } from "./look";
import { Renderer } from "./render";
import { loadSim, type SimPlayer, type World } from "./sim";
import { healthPips, killerPrompts, status, survivorPrompts } from "./prompts";
import { hearsHeartbeat, isOut, results, spectateTarget } from "./endgame";

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
  const { players, hud: lines, self, world } = session.view(now, carry / tickMs);
  draw(players, lines, self, world);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

const check = document.querySelector<HTMLDivElement>("#check")!;
const checkZone = document.querySelector<HTMLDivElement>("#check-zone")!;
const checkNeedle = document.querySelector<HTMLDivElement>("#check-needle")!;
const checkResult = document.querySelector<HTMLDivElement>("#check-result")!;
const flash = document.querySelector<HTMLDivElement>("#flash")!;
// Hits this tab's own survivor has taken, as seen here. Exposed for the tools/ drivers.
const seen = { hits: 0 };
(globalThis as { paleHitsSeen?: typeof seen }).paleHitsSeen = seen;
let lastHealth: { id: number; health: number } | undefined;

/** A red flash when this tab's survivor gets worse. The host decided it; this only shows it. */
function showHit(me: SimPlayer | undefined) {
  if (me && lastHealth?.id === me.id && me.health > lastHealth.health) {
    seen.hits++;
    flash.classList.add("on");
    requestAnimationFrame(() => flash.classList.remove("on"));
  }
  lastHealth = me && { id: me.id, health: me.health };
}

// Spectating: once this tab's survivor is out, the camera follows someone
// still in play. Space or a click moves to the next one. Exposed for the tools/ drivers.
const spectate: { pick: number; id: number | undefined } = { pick: 0, id: undefined };
(globalThis as { paleSpectate?: typeof spectate }).paleSpectate = spectate;
const nextWatch = () => spectate.id !== undefined && spectate.pick++;
addEventListener("keydown", (e) => e.code === "Space" && !e.repeat && nextWatch());
canvas.addEventListener("mousedown", (e) => e.button === 0 && nextWatch());

const result = document.querySelector<HTMLDivElement>("#result")!;
const resultHeadline = document.querySelector<HTMLHeadingElement>("#result-headline")!;
const resultLines = document.querySelector<HTMLDivElement>("#result-lines")!;
const rematch = document.querySelector<HTMLButtonElement>("#rematch")!;
rematch.addEventListener("click", () => {
  if (session instanceof HostSession) session.rematch();
  spectate.pick = 0;
  rematch.blur();
});

const healthBar = document.querySelector<HTMLDivElement>("#health")!;
const pips = [...healthBar.querySelectorAll<HTMLDivElement>(".pip")];

function draw(players: SimPlayer[], lines: string[], self: number | undefined, world: World) {
  const { gens, gates } = world;
  const me = players.find((p) => p.id === self);
  const watching = me && isOut(me) ? spectateTarget(players, spectate.pick, sim) : undefined;
  spectate.id = watching?.id;
  if (watching) renderer.draw(players, world, watching.id, (watching.yaw / 65536) * 2 * Math.PI, 0);
  else renderer.draw(players, world, self, look.yaw, look.pitch);
  const killer = players.find((p) => p.role === sim.roles.killer);
  // Only survivors hear it, and only while it can help them. The killer does not hear his own heart.
  const hears = me && killer && me.role !== sim.roles.killer && hearsHeartbeat(me) && !world.over;
  heartbeat.update(hears ? Math.hypot(killer.x - me.x, killer.y - me.y) / m : undefined);
  lines = [...lines, `volume ${volume.value}%` + (heartbeat.current.bpm > 0 ? `   heartbeat ${heartbeat.current.bpm.toFixed(0)} bpm` : "")];
  for (const p of players) {
    lines.push(`${p.role === sim.roles.killer ? "killer  " : "survivor"} ${p.id} ${fmt(p)}` + (p.role === sim.roles.survivor ? `   ${status(p, sim)}` : ""));
  }
  const done = gens.filter((g) => g >= sim.genTicks).length;
  lines.push(`generators ${done}/${gens.length} done   ` + gens.map((g) => `${Math.floor((100 * Math.min(g, sim.genTicks)) / sim.genTicks)}%`).join(" "));
  const mine = players.find((p) => p.id === self);
  const powered = done >= sim.gensRequired;
  lines.push(powered ? "gates powered: " + gates.map((g) => (g >= sim.gateTicks ? "OPEN" : `${Math.floor((100 * g) / sim.gateTicks)}%`)).join(" ") : `gates need ${sim.gensRequired} generators`);
  if (mine && mine.role === sim.roles.killer) {
    const s = sim.swing;
    lines.push(mine.swing === s.windup ? "swinging..." : mine.swing === s.recover ? (mine.swingResult === s.hit ? "HIT" : "missed") : mine.carrying ? "" : "click to attack");
    lines.push(...killerPrompts(mine, players, sim));
    // Where a missed skill check just went off, so the killer can find it even when it is out of view.
    world.noise.forEach((ticks, i) => {
      if (ticks <= 0) return;
      const dx = sim.genSites[i].x - mine.x;
      const dy = sim.genSites[i].y - mine.y;
      const ang = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360; // 0 is north, clockwise
      const rel = Math.round((((ang - (mine.yaw / 65536) * 360 + 540) % 360) - 180));
      lines.push(`NOISE generator ${i + 1}: ${(Math.hypot(dx, dy) / m).toFixed(0)} m, ${Math.abs(rel)}° ${rel < 0 ? "left" : "right"}`);
    });
  }
  if (mine && mine.role === sim.roles.survivor) {
    const near = sim.genSites.some((s, i) => gens[i] < sim.genTicks && Math.hypot(s.x - mine.x, s.y - mine.y) <= sim.repairRange);
    const atGate = sim.gateSites.some((s, i) => Math.hypot(s.x - mine.x, s.y - mine.y) <= sim.gateRange && gates[i] < sim.gateTicks);
    showHit(mine);
    const prompts = survivorPrompts(mine, players, sim);
    const able = mine.health !== sim.health.downed && !mine.repairing && !mine.escaped && prompts.length === 0;
    if (mine.health === sim.health.injured && mine.boost > 0) lines.push("you are hit: run");
    lines.push(...prompts);
    if (near && able) lines.push("hold E to repair");
    else if (atGate && powered && able) lines.push("hold E to open the gate");
    else if (mine.repairing && !mine.checkActive) lines.push("working...");
  }
  // Two squares: full health, one when injured, none when down.
  healthBar.style.display = mine?.role === sim.roles.survivor && !isOut(mine) ? "flex" : "none";
  const filled = mine ? healthPips(mine, sim) : 0;
  pips.forEach((pip, i) => pip.classList.toggle("full", i < filled));
  if (watching) lines.push(`spectating ${watching.role === sim.roles.killer ? "the killer" : `survivor ${watching.id}`}: Space or click to switch`);
  hud.textContent = lines.join("\n");

  result.style.display = world.over ? "flex" : "none";
  if (world.over) {
    const r = results(me, players, sim);
    resultHeadline.textContent = r.headline;
    resultLines.textContent = r.lines.join("\n");
    rematch.style.display = session instanceof HostSession ? "block" : "none";
  }

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
