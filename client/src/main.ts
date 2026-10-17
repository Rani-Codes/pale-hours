import { initLobby, renderRoom } from "./lobby";
import { nameOf } from "./room";import { GuestSession, HostSession, IdleSession, type Session } from "./session";
import { audio, view } from "./config";
import { Heartbeat } from "./heartbeat";
import { look, initLook } from "./look";
import { Renderer } from "./render";
import { loadSim, type SimPlayer, type World } from "./sim";
import { healthPips, carryBanner, killerPrompts, palletPrompt, repairLine, survivorPrompts } from "./prompts";
import { hearsHeartbeat, isOut, newExits, results, spectateTarget } from "./endgame";
import { newlyDone } from "./genflash";
import { HookAlerts } from "./hookalert";

const m = 1_000_000; // micrometers per meter

const canvas = document.querySelector<HTMLCanvasElement>("#view")!;
const hud = document.querySelector<HTMLDivElement>("#hud")!;
const sim = await loadSim("/sim.wasm");
const renderer = new Renderer(canvas, sim);
const hookAlerts = new HookAlerts(view.hookAlert.showMs, sim.roles);
initLook(canvas);
const heartbeat = new Heartbeat(audio.heartbeat, audio.generatorDone);
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
use(new IdleSession(sim));

initLobby({
  host(name) {
    const host = new HostSession(sim, name);
    use(host);
    return (link) => host.addGuest(link);
  },
  join(name) {
    return (link) => use(new GuestSession(sim, link, name));
  },
  pick: (role) => session.pick?.(role),
  setName: (name) => session.setName?.(name),
  start: () => session instanceof HostSession && session.start(),
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
  renderRoom(session.room?.());
  const { players, self, world } = session.view(now, carry / tickMs);
  draw(players, self, world);
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
const resultYou = document.querySelector<HTMLDivElement>("#result-you")!;
const resultLines = document.querySelector<HTMLDivElement>("#result-lines")!;
const rematch = document.querySelector<HTMLButtonElement>("#rematch")!;
rematch.addEventListener("click", () => {
  if (session instanceof HostSession) session.rematch();
  spectate.pick = 0;
  rematch.blur();
});

const gensKnown: number[] = []; // each generator's progress as of the last frame
const nameOfId = (id: number) => nameOf(session.room?.().seats ?? [], id);

// Everyone is told when a survivor gets out, unless that ends the match: the end screen says it then.
const feed = document.querySelector<HTMLDivElement>("#feed")!;
const exitsKnown = new Map<number, "in" | "escaped" | "died">();
function announce(players: SimPlayer[], over: boolean) {
  for (const e of newExits(exitsKnown, players, sim)) {
    if (over) continue;
    const note = document.createElement("div");
    note.className = e.how;
    note.textContent = `${nameOfId(e.id)} ${e.how === "escaped" ? "escaped" : "died"}`;
    feed.append(note);
    setTimeout(() => note.remove(), view.feedMs);
  }
}

const toLobby = document.querySelector<HTMLButtonElement>("#to-lobby")!;
toLobby.addEventListener("click", () => {
  if (session instanceof HostSession) session.toLobby();
  spectate.pick = 0;
  toLobby.blur();
});

const carryBox = document.querySelector<HTMLDivElement>("#carry")!;
const healthBar = document.querySelector<HTMLDivElement>("#health")!;
const pips = [...healthBar.querySelectorAll<HTMLDivElement>(".pip")];

let checkAtGen = false; // whether the current or last skill check was a generator's
let checkEndedAt: number | undefined; // when the last skill check ended, for its result

function draw(players: SimPlayer[], self: number | undefined, world: World) {
  const lines = ["move: WASD or arrows"];
  const { gens, gates } = world;
  const me = players.find((p) => p.id === self);
  const watching = me && isOut(me) ? spectateTarget(players, spectate.pick, sim) : undefined;
  spectate.id = watching?.id;
  announce(players, !!world.over);
  for (const i of newlyDone(gensKnown, gens, sim.genTicks)) {
    renderer.flashGenerator(i);
    heartbeat.generatorDone();
  }
  feed.style.display = world.over ? "none" : "";
  const hooked = hookAlerts.update(players, self, performance.now());
  if (watching) renderer.draw(players, world, watching.id, (watching.yaw / 65536) * 2 * Math.PI, 0, hooked);
  else renderer.draw(players, world, self, look.yaw, look.pitch, hooked);
  const killer = players.find((p) => p.role === sim.roles.killer);
  // Only survivors hear it, and only while it can help them. The killer does not hear his own heart.
  const hears = me && killer && me.role !== sim.roles.killer && hearsHeartbeat(me) && !world.over;
  heartbeat.update(hears ? Math.hypot(killer.x - me.x, killer.y - me.y) / m : undefined);
  const done = gens.filter((g) => g >= sim.genTicks).length;
  lines.push(`generators ${done}/${gens.length} done`);
  const mine = players.find((p) => p.id === self);
  const powered = done >= sim.gensRequired;
  if (mine && mine.role === sim.roles.killer) {
    const s = sim.swing;
    lines.push(mine.swing === s.windup ? "swinging..." : mine.swing === s.recover ? (mine.swingResult === s.hit ? "HIT" : "missed") : mine.carrying || mine.freeze ? "" : "click to attack");
    const carryPrompts = killerPrompts(mine, players, sim);
    lines.push(...carryPrompts);
    const breakPrompt = palletPrompt(mine, world.pallets, world.palletBreak, sim);
    if (breakPrompt && carryPrompts.length === 0) lines.push(breakPrompt);
  }
  if (mine && mine.role === sim.roles.survivor) {
    const near = sim.genSites.some((s, i) => gens[i] < sim.genTicks && Math.hypot(s.x - mine.x, s.y - mine.y) <= sim.repairRange);
    const atGate = sim.gateSites.some((s, i) => Math.hypot(s.x - mine.x, s.y - mine.y) <= sim.gateRange && gates[i] < sim.gateTicks);
    for (const h of hooked) lines.push(`TEAMMATE HOOKED: ${nameOfId(h.id)}, ${bearing(mine, sim.hookSites[h.hook])}`);
    showHit(mine);
    const prompts = survivorPrompts(mine, players, sim, sim.canVault(Math.round(mine.x), Math.round(mine.y)));
    const able = mine.health !== sim.health.downed && !mine.repairing && !mine.escaped && prompts.length === 0;
    if (mine.health === sim.health.injured && mine.boost > 0) lines.push("you are hit: run");
    lines.push(...prompts);
    const throwPrompt = palletPrompt(mine, world.pallets, world.palletBreak, sim);
    if (throwPrompt && prompts.length === 0) lines.push(throwPrompt);
    const inGrass = sim.grass.some((g) => mine.x > g.minX && mine.x < g.maxX && mine.y > g.minY && mine.y < g.maxY);
    if (mine.hideTicks >= sim.hideSettleTicks) lines.push("hidden: stay still, and the killer cannot see you unless he is close");
    else if (mine.crouching && inGrass) lines.push("hold still to hide in the grass...");
    else if (inGrass && able && !mine.boost) lines.push("hold C to crouch, then stay still, to hide in the grass");
    if (near && able) lines.push("hold E to repair");
    else if (atGate && powered && able) lines.push("hold E to open the gate");
    else if (mine.opening && !mine.checkActive) lines.push("opening the gate...");
    const repair = repairLine(mine, gens, sim);
    if (repair) lines.push(repair);
  }
  const banner = mine?.role === sim.roles.killer ? carryBanner(mine, nameOfId) : "";
  carryBox.textContent = banner;
  carryBox.style.display = banner ? "block" : "none";
  // Two squares: full health, one when injured, none when down.
  healthBar.style.display = mine?.role === sim.roles.survivor && !isOut(mine) ? "flex" : "none";
  const filled = mine ? healthPips(mine, sim) : 0;
  pips.forEach((pip, i) => pip.classList.toggle("full", i < filled));
  if (watching) lines.push(`spectating ${nameOfId(watching.id)}${watching.role === sim.roles.killer ? " (the killer)" : ""}: Space or click to switch`);
  hud.textContent = lines.join("\n");
  hud.style.display = self === undefined ? "none" : ""; // in the lobby there is nothing to report

  result.style.display = world.over ? "flex" : "none";
  if (world.over) {
    const r = results(me, players, sim, nameOfId);
    resultHeadline.textContent = r.headline;
    resultYou.textContent = r.you;
    resultLines.textContent = r.lines.join("\n");
    rematch.style.display = toLobby.style.display = session instanceof HostSession ? "block" : "none";
  }

  // The skill check: a needle sweeps the bar, press Space while it is in the bright zone.
  check.style.display = mine?.checkActive ? "block" : "none";
  if (mine?.checkActive) {
    const span = sim.check.duration;
    checkZone.style.left = `${(100 * mine.checkZone) / span}%`;
    checkZone.style.width = `${(100 * sim.check.zoneLen) / span}%`;
    checkNeedle.style.left = `${(100 * Math.min(mine.checkAge, span)) / span}%`;
  }
  // The result shows for a moment after the check ends. At a generator it
  // says what the check did to the repair, even after letting go.
  const now = performance.now();
  if (mine?.checkActive) {
    checkAtGen = mine.repairing && !mine.opening && !mine.helping && !mine.onHook;
    checkEndedAt = undefined;
  } else if (checkEndedAt === undefined && mine?.checkResult) checkEndedAt = now;
  const fresh = checkEndedAt !== undefined && now - checkEndedAt < view.checkResultMs;
  const delta = (ticks: number) => (checkAtGen ? ` ${ticks > 0 ? "+" : "-"}${Number(((100 * Math.abs(ticks)) / sim.genTicks).toFixed(1))}%` : "");
  checkResult.textContent = !fresh ? "" : mine?.checkResult === 1 ? "good" + delta(sim.checkBonus) : mine?.checkResult === 2 ? "missed" + delta(-sim.checkPenalty) : "";
}

/** How far and which way to turn from where p faces to reach a site. */
function bearing(p: SimPlayer, site: { x: number; y: number }): string {
  const dx = site.x - p.x;
  const dy = site.y - p.y;
  const ang = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360; // 0 is north, clockwise
  const rel = Math.round(((ang - (p.yaw / 65536) * 360 + 540) % 360) - 180);
  return `${(Math.hypot(dx, dy) / m).toFixed(0)} m, ${Math.abs(rel)}° ${rel < 0 ? "left" : "right"}`;
}

