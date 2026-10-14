import "./lobby";
import { loadSim, type SimInput, type SimPlayer, type SimState } from "./sim";

const MICROMETERS_PER_METER = 1_000_000;
const KILLER_ID = 1;
const SURVIVOR_ID = 2;

const keyBindings = [
  { id: KILLER_ID, up: "KeyW", down: "KeyS", left: "KeyA", right: "KeyD" },
  { id: SURVIVOR_ID, up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" },
];

const canvas = document.querySelector<HTMLCanvasElement>("#view")!;
const hud = document.querySelector<HTMLDivElement>("#hud")!;
const ctx = canvas.getContext("2d")!;

const held = new Set<string>();
const boundKeys = new Set(keyBindings.flatMap((b) => [b.up, b.down, b.left, b.right]));
addEventListener("keydown", (e) => {
  if (boundKeys.has(e.code)) e.preventDefault();
  held.add(e.code);
});
addEventListener("keyup", (e) => held.delete(e.code));
addEventListener("blur", () => held.clear());

function axis(negative: string, positive: string): number {
  return (held.has(positive) ? 127 : 0) - (held.has(negative) ? 127 : 0);
}

function readInputs(): SimInput[] {
  return keyBindings.map((b) => ({ id: b.id, moveX: axis(b.left, b.right), moveY: axis(b.down, b.up) }));
}

const sim = await loadSim("/sim.wasm");
const m = MICROMETERS_PER_METER;
sim.reset([
  { id: KILLER_ID, role: sim.roles.killer, x: -10 * m, y: 0 },
  { id: SURVIVOR_ID, role: sim.roles.survivor, x: 10 * m, y: 0 },
]);

const tickMs = 1000 / sim.tickRate;
let prev = sim.state();
let curr = prev;
let carry = 0;
let last = performance.now();

function frame(now: number) {
  carry += Math.min(now - last, 250);
  last = now;
  while (carry >= tickMs) {
    sim.step(readInputs());
    prev = curr;
    curr = sim.state();
    carry -= tickMs;
  }
  draw(prev, curr, carry / tickMs);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function draw(from: SimState, to: SimState, alpha: number) {
  const dpr = devicePixelRatio;
  const w = (canvas.width = innerWidth * dpr);
  const h = (canvas.height = innerHeight * dpr);
  const half = sim.mapHalfExtent;
  const scale = (Math.min(w, h) * 0.9) / (2 * half);
  const toScreen = (x: number, y: number) => [w / 2 + x * scale, h / 2 - y * scale] as const;

  ctx.fillStyle = "#0b0b0d";
  ctx.fillRect(0, 0, w, h);
  const [left, top] = toScreen(-half, half);
  ctx.fillStyle = "#16161a";
  ctx.fillRect(left, top, 2 * half * scale, 2 * half * scale);

  ctx.strokeStyle = "#202027";
  ctx.lineWidth = dpr;
  for (let g = -half; g <= half; g += 5 * m) {
    const [gx] = toScreen(g, 0);
    const [, gy] = toScreen(0, g);
    ctx.beginPath();
    ctx.moveTo(gx, top);
    ctx.lineTo(gx, top + 2 * half * scale);
    ctx.moveTo(left, gy);
    ctx.lineTo(left + 2 * half * scale, gy);
    ctx.stroke();
  }

  const lines = [`tick ${to.tick}`, "killer: WASD   survivor: arrow keys", ""];
  to.players.forEach((p, i) => {
    const a = from.players[i] ?? p;
    const [sx, sy] = toScreen(a.x + (p.x - a.x) * alpha, a.y + (p.y - a.y) * alpha);
    const killer = p.role === sim.roles.killer;
    ctx.fillStyle = killer ? "#c0392b" : "#d8d4c8";
    ctx.beginPath();
    ctx.arc(sx, sy, (killer ? 0.5 : 0.4) * m * scale, 0, Math.PI * 2);
    ctx.fill();
    lines.push(`${killer ? "killer  " : "survivor"} ${fmt(p)}`);
  });
  hud.textContent = lines.join("\n");
}

function fmt(p: SimPlayer): string {
  return `x ${(p.x / m).toFixed(2).padStart(6)} m   y ${(p.y / m).toFixed(2).padStart(6)} m`;
}
