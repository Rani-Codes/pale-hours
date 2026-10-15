// Usage: node drive-netplay.mjs <url> <shot-prefix> [lag query, e.g. "delay=100&loss=0.05"]
// Host and guest tabs in real Chrome, both sending through the given simulated
// lag. Checks that the guest's own movement is predicted instantly and lands
// exactly where the host puts it, and that the guest draws the host's killer
// smoothly, behind but converging on the host's position.
import { chromium } from "playwright-core";

const [url = "http://localhost:5173/", prefix = "netplay", lag = ""] = process.argv.slice(2);
const target = new URL(url);
for (const [k, v] of new URLSearchParams(lag)) target.searchParams.set(k, v);
const delayMs = Number(new URLSearchParams(lag).get("delay") ?? 0);
const jitterMs = Number(new URLSearchParams(lag).get("jitter") ?? 0);

// Automated Chrome does not resolve mDNS host candidates between tabs, so ICE stalls; send raw LAN IPs instead.
const browser = await chromium.launch({ channel: "chrome", args: ["--disable-features=WebRtcHideLocalIpsWithMdns"] });
const errors = [];
const open = async (name) => {
  const context = await browser.newContext({ viewport: { width: 900, height: 600 } });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${name}: ${m.text()}`));
  await page.goto(target.href);
  await page.waitForFunction(() => globalThis.paleSession);
  return page;
};
const host = await open("host");
const guest = await open("guest");
const results = [];
const metrics = { failed: [] };
const check = (name, ok, detail) => {
  results.push(ok);
  if (!ok) metrics.failed.push(name);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`);
};

await host.click("#host");
await host.waitForFunction(() => /room [A-Z0-9]{4}/.test(document.querySelector("#netstatus").textContent));
const code = (await host.textContent("#netstatus")).match(/room ([A-Z0-9]{4})/)[1];
await guest.fill("#code", code);
const joinStart = Date.now();
await guest.click("#join");
await guest.waitForFunction(() => /connected/.test(document.querySelector("#netstatus").textContent), null, { timeout: 15000 });
const linkedMs = Date.now() - joinStart;
await guest.waitForFunction(() => paleSession.stats?.().predicted, null, { timeout: 15000 });
metrics.joinMs = Date.now() - joinStart;
console.log(`join: link open after ${linkedMs} ms, playing after ${metrics.joinMs} ms`);
await guest.waitForTimeout(1000);

const settleMs = 2 * delayMs + jitterMs + 600;
const hostState = () => host.evaluate(() => paleSim.state());
const guestStats = () => guest.evaluate(() => paleSession.stats());
const hostStats = () => host.evaluate(() => paleSession.stats());
const fmtM = (um) => `${(um / 1e6).toFixed(3)} m`;

// 1. Guest moves east for one second.
const g0 = await guestStats();
const selfId = g0.selfId;
await guest.keyboard.down("KeyD");
const early = await guest.evaluate(
  () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => r(paleSession.stats().predicted))))),
);
check(
  "guest movement is predicted without waiting for the host",
  early.x > g0.predicted.x,
  `moved ${fmtM(early.x - g0.predicted.x)} within 3 frames; round trip is at least ${2 * delayMs} ms`,
);
await guest.waitForTimeout(1000);
await guest.keyboard.up("KeyD");
await guest.waitForTimeout(settleMs);

const g1 = await guestStats();
const hostSelf = (await hostState()).players.find((p) => p.id === selfId);
const moved = g1.predicted.x - g0.predicted.x;
check("guest moved about one second east", moved > 3.4e6 && moved < 4.6e6, fmtM(moved));
check(
  "host agrees exactly with the guest's prediction",
  hostSelf.x === g1.predicted.x && hostSelf.y === g1.predicted.y,
  `host x ${hostSelf.x}, guest x ${g1.predicted.x}`,
);
check("guest needed no corrections", g1.corrections === 0, `${g1.corrections} corrections`);
// Inputs flow every tick even when idle, so about one round trip of them is always in flight.
const inFlight = Math.ceil((2 * delayMs + jitterMs) / (1000 / 30)) + 4;
check("host acks keep up with the guest", g1.unacked <= inFlight, `${g1.unacked} unacked, at most ${inFlight} expected`);

// 2. Killer (host) moves north for one second; sample what the guest draws each frame.
const k0 = (await hostState()).players.find((p) => p.id === 1);
const firstDrawn = guest.evaluate(
  (y0) =>
    new Promise((r) => {
      const poll = () => {
        if (paleSession.view(performance.now(), 0).players.find((p) => p.id === 1).y !== y0) r(Date.now());
        else requestAnimationFrame(poll);
      };
      poll();
    }),
  k0.y,
);
const pressedAt = Date.now();
await host.keyboard.down("KeyW");
const trace = guest.evaluate(
  (ms) =>
    new Promise((r) => {
      const ys = [];
      const end = performance.now() + ms;
      const step = () => {
        const killer = paleSession.view(performance.now(), 0).players.find((p) => p.id === 1);
        ys.push(killer.y);
        if (performance.now() < end) requestAnimationFrame(step);
        else r(ys);
      };
      requestAnimationFrame(step);
    }),
  1000 + settleMs,
);
await host.waitForTimeout(1000);
await host.keyboard.up("KeyW");
const ys = await trace;
metrics.killerShownMs = (await firstDrawn) - pressedAt;
console.log(`killer keypress on host to motion drawn on guest: ${metrics.killerShownMs} ms`);
const k1 = (await hostState()).players.find((p) => p.id === 1);
const drawn = ys.at(-1);
check("guest draws the killer where the host has it once it stops", drawn === k1.y, `host y ${k1.y}, drawn y ${drawn}`);
const backwards = ys.slice(1).filter((y, i) => y < ys[i]).length;
check("drawn killer never moves backwards", backwards === 0, `${backwards} backward steps over ${ys.length} frames`);
const killerPerFrame = 4.6e6 / 60;
const biggest = Math.max(...ys.slice(1).map((y, i) => y - ys[i]));
check(
  "drawn killer never jumps more than two frames of movement",
  biggest <= 2.5 * killerPerFrame,
  `largest step ${fmtM(biggest)} (killer covers ${fmtM(killerPerFrame)} per 60 Hz frame)`,
);
// Only a lower bound: the key-up can reach the host tab late, which says nothing about netcode.
check("killer moved for about one second", k1.y - k0.y > 3.9e6, fmtM(k1.y - k0.y));

const hs = await hostStats();
const gs = await guestStats();
const behind = hs.tick - gs.renderTick;
console.log(`host tick ${hs.tick}, guest renders host tick ${gs.renderTick.toFixed(1)} (${behind.toFixed(1)} ticks behind), ${gs.starved} starved frames`);
console.log(`host input queue ${JSON.stringify(hs.guests)}`);
Object.assign(metrics, { corrections: gs.corrections, starved: gs.starved, dropped: hs.guests[0].dropped });
console.log(`room ${code}  host: ${(await host.textContent("#netstatus")).replace(/\n/g, " | ")}`);
console.log(`guest: ${(await guest.textContent("#netstatus")).replace(/\n/g, " | ")}`);

await host.screenshot({ path: `${prefix}-host.png` });
await guest.screenshot({ path: `${prefix}-guest.png` });
await browser.close();
check("no page errors", errors.length === 0, errors.join(" | ") || "none");
console.log(`METRICS ${JSON.stringify(metrics)}`);
process.exit(results.every(Boolean) ? 0 : 1);
