// Usage: node drive-gates.mjs <url> <shot-prefix> [query]
// Host and guest in real Chrome. Four generators are marked done on the host
// as test setup (finishing four by hand takes five minutes); everything after
// that is real keys. The guest walks to the north gate in the fence, finds
// it shut (no walking past it) and unpowered (E does nothing), then opens it
// by hand hitting every skill check, is still inside once it is open, and
// escapes only after walking down the exit lane.
import { chromium } from "playwright-core";
import { startMatch } from "./lib/lobby.mjs";

const [url = "http://localhost:5173/", prefix = "gates", query = ""] = process.argv.slice(2);
const withQuery = (u) => (query ? u + (u.includes("?") ? "&" : "?") + query : u);
const browser = await chromium.launch({ channel: "chrome", args: ["--disable-features=WebRtcHideLocalIpsWithMdns"] });
const context = await browser.newContext({ viewport: { width: 900, height: 600 } });
const errors = [];
const open = async (name) => {
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${name}: ${m.text()}`));
  await page.goto(withQuery(url));
  await page.waitForFunction(() => globalThis.paleSim);
  return page;
};
const host = await open("host");
const guest = await open("guest");
await host.click("#host");
await host.waitForFunction(() => /room [A-Z0-9]{4}/.test(document.querySelector("#netstatus").textContent));
const code = (await host.textContent("#netstatus")).match(/room ([A-Z0-9]{4})/)[1];
await guest.fill("#code", code);
await guest.click("#join");
const linked = () => /rtt reliable/.test(document.querySelector("#netstatus").textContent);
await host.waitForFunction(linked, null, { timeout: 15000 });
await guest.waitForFunction(linked, null, { timeout: 15000 });
await guest.waitForFunction(() => globalThis.paleSession?.stats?.().selfId);
const [startCorrections] = await startMatch(host, [guest]);
await guest.bringToFront();

const me = () => guest.evaluate(() => paleSession.stats().predicted);
const gates = (page) => page.evaluate(() => paleSim.state().gates);

// Walk north up the east side of the map to the gate's latitude, then west to it.
await guest.keyboard.down("KeyW");
await guest.waitForTimeout(7200);
await guest.keyboard.up("KeyW");
await guest.keyboard.down("KeyA");
await guest.waitForTimeout(2300);
await guest.keyboard.up("KeyA");
const parked = await me();

// The shut gate holds: walking north stays on the near side.
await guest.keyboard.down("KeyW");
await guest.waitForTimeout(800);
await guest.keyboard.up("KeyW");
await guest.waitForTimeout(300);
const pushed = await me();

// Unpowered: holding E at the gate must do nothing.
await guest.keyboard.down("KeyE");
await guest.waitForTimeout(1000);
await guest.keyboard.up("KeyE");
await guest.waitForTimeout(500);
const unpowered = await gates(host);

// Setup: power the gates by marking four generators done on the host.
await host.evaluate(() => {
  const s = paleSim.state();
  s.gens = s.gens.map((g, i) => (i < paleSim.gensRequired ? paleSim.genTicks : g));
  paleSim.load(s);
});
await guest.waitForFunction((n) => paleSession.stats().predicted && globalThis.paleSim.state().gens.filter((g) => g >= paleSim.genTicks).length >= n, 4, { timeout: 5000 });
await guest.screenshot({ path: `${prefix}-powered.png` });

// Open it, hitting every skill check that comes.
await guest.keyboard.down("KeyE");
const startedAt = Date.now();
await guest.waitForFunction(() => paleSim.state().gates[0] > 0, null, { timeout: 3000 });
const results = [];
let shotCheck = false;
while (!(await guest.evaluate(() => paleSim.state().gates[0] >= paleSim.gateTicks)) && Date.now() - startedAt < 15000) {
  const active = await guest.waitForFunction(() => paleSession.stats().predicted.checkActive || paleSim.state().gates[0] >= paleSim.gateTicks, null, { timeout: 5000, polling: 10 }).then(() => guest.evaluate(() => paleSession.stats().predicted.checkActive));
  if (!active) break;
  if (!shotCheck) await guest.screenshot({ path: `${prefix}-check.png` }), (shotCheck = true);
  await guest.waitForFunction(() => { const p = paleSession.stats().predicted; return !p.checkActive || p.checkAge >= p.checkZone + 1; }, null, { polling: 5 });
  await guest.keyboard.press("Space");
  await guest.waitForFunction(() => !paleSession.stats().predicted.checkActive, null, { timeout: 3000 });
  results.push(await guest.evaluate(() => paleSession.stats().predicted.checkResult));
}
const openMs = Date.now() - startedAt;
await guest.keyboard.up("KeyE");
await guest.waitForTimeout(800);
const atOpen = await me();
const corrOpen = (await guest.evaluate(() => paleSession.stats())).corrections;
await guest.screenshot({ path: `${prefix}-open.png` });

// The killer follows to the gate line and no further, and his swing reaches
// a survivor just past it. Setup places the two; W and the click are real.
await host.evaluate(() => {
  const s = paleSim.state();
  for (const p of s.players) Object.assign(p, p.id === 1 ? { x: 0, y: 27e6, yaw: 0 } : { x: 0, y: 30.8e6, health: 0 }, { trail: undefined });
  paleSim.load(s);
});
await host.evaluate(() => (paleLook.yaw = 0));
await host.waitForTimeout(800);
await host.keyboard.down("KeyW");
await host.waitForTimeout(1500);
await host.keyboard.up("KeyW");
const killerStop = await host.evaluate(() => paleSim.state().players.find((p) => p.id === 1));
await host.mouse.click(450, 300);
await host.waitForTimeout(1200);
const laneHit = { host: (await host.evaluate(() => paleSim.state().players.find((p) => p.id === 2))).health, guest: (await me()).health };
await host.screenshot({ path: `${prefix}-killer-at-gate.png` });
const corrPlaced = (await guest.evaluate(() => paleSession.stats())).corrections; // the setup teleport is one

// Walk out down the lane.
await guest.keyboard.down("KeyW");
await guest.waitForFunction(() => paleSession.stats().predicted.escaped, null, { timeout: 5000, polling: 10 }).catch(() => {});
await guest.keyboard.up("KeyW");
await guest.waitForTimeout(1500);

const hostGate = (await gates(host))[0];
const guestPlayer = await me();
const hostPlayer = await host.evaluate(() => paleSim.state().players.find((p) => p.id === 2));
const { gateTicks: ticksNeeded, mapHalfExtent: edge, exitDepth } = await host.evaluate(() => paleSim);
const stats = await guest.evaluate(() => paleSession.stats());
const corrections = corrOpen - startCorrections + stats.corrections - corrPlaced; // everything but the setup teleports
await host.screenshot({ path: `${prefix}-host.png` });
await guest.screenshot({ path: `${prefix}-guest.png` });
await browser.close();

console.log(`parked at (${parked.x / 1e6}, ${parked.y / 1e6}) m, pushed north to y ${pushed.y / 1e6}, gate progress while unpowered ${unpowered[0]}`);
console.log(`opened in ${openMs} ms with checks ${JSON.stringify(results)}; host gate ${hostGate}/${ticksNeeded}; at open y ${atOpen.y / 1e6} escaped ${atOpen.escaped}; out at host y ${hostPlayer.y / 1e6}; escaped host ${hostPlayer.escaped}, guest ${guestPlayer.escaped}; corrections ${corrections}`);
console.log(`killer stopped at y ${killerStop.y / 1e6}; lane hit ${JSON.stringify(laneHit)}`);
console.log(`errors: ${errors.length ? errors.join(" | ") : "none"}`);
const checks = {
  "reached the gate": Math.hypot(parked.x, parked.y - edge) < 2.5e6,
  "the shut gate holds, nobody gets behind it": pushed.y < edge - 0.5e6,
  "an unpowered gate does not move": unpowered[0] === 0,
  // A check still up when the gate opens just goes away (0) rather than counting.
  "opening brings skill checks, all hit": results.some((r) => r === 1) && results.every((r, i) => r === 1 || (r === 0 && i === results.length - 1)),
  "opening takes over 6 s even hitting every check": openMs > 6000,
  "a powered gate opens by hand": hostGate >= ticksNeeded,
  "opening alone is not escaping": !atOpen.escaped,
  "the killer cannot follow past the gate line": killerStop.y < edge,
  "his swing hits a survivor just past it, on both tabs": laneHit.host === 1 && laneHit.guest === 1,
  "the survivor escapes down the lane": hostPlayer.escaped && guestPlayer.escaped && hostPlayer.y >= edge + exitDepth,
  "no corrections": corrections === 0,
  "no errors": errors.length === 0,
};
for (const [name, pass] of Object.entries(checks)) console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
