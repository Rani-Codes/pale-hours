import { initLobby } from "./lobby";
import { GuestSession, HostSession, LocalSession, type Session } from "./session";
import { loadSim, type SimPlayer } from "./sim";

const m = 1_000_000; // micrometers per meter

const canvas = document.querySelector<HTMLCanvasElement>("#view")!;
const hud = document.querySelector<HTMLDivElement>("#hud")!;
const ctx = canvas.getContext("2d")!;

const sim = await loadSim("/sim.wasm");
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
  const { players, hud: lines } = session.view(now, carry / tickMs);
  draw(players, lines);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function draw(players: SimPlayer[], lines: string[]) {
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

  lines = [...lines, ""];
  for (const p of players) {
    const [sx, sy] = toScreen(p.x, p.y);
    const killer = p.role === sim.roles.killer;
    ctx.fillStyle = killer ? "#c0392b" : "#d8d4c8";
    ctx.beginPath();
    ctx.arc(sx, sy, (killer ? 0.5 : 0.4) * m * scale, 0, Math.PI * 2);
    ctx.fill();
    lines.push(`${killer ? "killer  " : "survivor"} ${p.id} ${fmt(p)}`);
  }
  hud.textContent = lines.join("\n");
}

function fmt(p: SimPlayer): string {
  return `x ${(p.x / m).toFixed(2).padStart(6)} m   y ${(p.y / m).toFixed(2).padStart(6)} m`;
}
