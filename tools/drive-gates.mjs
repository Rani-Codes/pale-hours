// Usage: node drive-gates.mjs <url> <shot-prefix> [query]
// Host and guest in real Chrome. Four generators are marked done on the host
// as test setup (finishing four by hand takes five minutes); everything after
// that is real keys. The guest checks a closed-and-unpowered gate does
// nothing first, then opens a powered gate by hand and walks out.
import { chromium } from "playwright-core";

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

await guest.keyboard.down("KeyE");
await guest.waitForFunction(() => paleSim.state().gates[0] > 0, null, { timeout: 3000 });
const opening = await guest.evaluate(() => paleSim.state().gates[0]);
await guest.waitForFunction(() => paleSession.stats().predicted.escaped, null, { timeout: 12000, polling: 50 });
await guest.keyboard.up("KeyE");
await guest.waitForTimeout(1500);

const hostGate = (await gates(host))[0];
const guestPlayer = await me();
const hostPlayer = await host.evaluate(() => paleSim.state().players.find((p) => p.id === 2));
const ticksNeeded = await host.evaluate(() => paleSim.gateTicks);
const stats = await guest.evaluate(() => paleSession.stats());
await host.screenshot({ path: `${prefix}-host.png` });
await guest.screenshot({ path: `${prefix}-guest.png` });
await browser.close();

console.log(`parked at (${parked.x / 1e6}, ${parked.y / 1e6}) m, gate progress while unpowered ${unpowered[0]}`);
console.log(`opening started at ${opening}; host gate ${hostGate}/${ticksNeeded}; escaped host ${hostPlayer.escaped}, guest ${guestPlayer.escaped}; corrections ${stats.corrections}`);
console.log(`errors: ${errors.length ? errors.join(" | ") : "none"}`);
const checks = {
  "reached the gate": Math.hypot(parked.x, parked.y - 28e6) < 2.5e6,
  "an unpowered gate does not move": unpowered[0] === 0,
  "a powered gate opens by hand": hostGate >= ticksNeeded,
  "the survivor escapes": hostPlayer.escaped && guestPlayer.escaped,
  "no corrections": stats.corrections === 0,
  "no errors": errors.length === 0,
};
for (const [name, pass] of Object.entries(checks)) console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
