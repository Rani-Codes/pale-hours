// Usage: node drive-generator.mjs <url> <shot-prefix> [query]
// Host and guest in real Chrome. The guest walks to the generator near the
// map centre, holds E to repair, presses Space on one skill check and lets the
// next one time out. The host must agree on the outcome and the progress.
import { chromium } from "playwright-core";
import { startMatch } from "./lib/lobby.mjs";

const [url = "http://localhost:5173/", prefix = "generator", query = ""] = process.argv.slice(2);
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
await startMatch(host, [guest]);
await guest.bringToFront();

const GEN = 2; // the site at (0, 5) m
const me = () => guest.evaluate(() => paleSession.stats().predicted);
const gen = (page) => page.evaluate((i) => paleSim.state().gens[i], GEN);

// Walk west to x = 0, then north until the generator body stops us.
await guest.keyboard.down("KeyA");
await guest.waitForTimeout(2600);
await guest.keyboard.up("KeyA");
await guest.keyboard.down("KeyW");
await guest.waitForTimeout(1800);
await guest.keyboard.up("KeyW");
const parked = await me();

// Repair. Wait for a skill check, press Space inside the zone.
await guest.keyboard.down("KeyE");
const waitCheck = async () => {
  await guest.waitForFunction(() => paleSession.stats().predicted?.checkActive, null, { timeout: 15000, polling: 10 });
  return me();
};
const first = await waitCheck();
const beforeHit = await gen(guest);
await guest.waitForFunction(
  () => {
    const p = paleSession.stats().predicted;
    return p.checkAge >= p.checkZone + 1;
  },
  null,
  { polling: 5 },
);
await guest.keyboard.press("Space");
await guest.waitForFunction(() => paleSession.stats().predicted.checkResult !== 0 && !paleSession.stats().predicted.checkActive, null, { timeout: 3000 });
const hit = await me();
const hitText = await guest.textContent("#check-result");
await guest.waitForTimeout(1200);
const hitTextLater = await guest.textContent("#check-result");

// The next one: leave it alone until it times out.
await waitCheck();
const beforeMiss = await gen(guest);
await guest.waitForFunction(() => !paleSession.stats().predicted.checkActive, null, { timeout: 5000, polling: 10 });
const miss = await me();
const loud = await host.waitForFunction((i) => paleSim.state().noise[i] > 0, GEN, { timeout: 1500, polling: 10 }).then(() => true, () => false);
const killerBeamShot = `${prefix}-killer-noise.png`;
await host.keyboard.press("KeyM"); // overhead map, so the beam is in view wherever the killer faces
await host.waitForTimeout(100);
await host.screenshot({ path: killerBeamShot });
await host.keyboard.press("KeyM");
const hostHud = await host.textContent("#hud");
const afterMiss = await gen(guest);
await guest.keyboard.up("KeyE");
await guest.waitForTimeout(1500); // let the host's last snapshot land

const hostP = await host.evaluate(() => paleSim.state().players.find((p) => p.id === 2));
const hostGen = await gen(host);
const guestGen = await gen(guest);
const guestP = await me();
const stats = await guest.evaluate(() => paleSession.stats());
await host.screenshot({ path: `${prefix}-host.png` });
await guest.screenshot({ path: `${prefix}-guest.png` });
await browser.close();

console.log(`parked at (${parked.x / 1e6}, ${parked.y / 1e6}) m`);
console.log(`check 1 zone ${first.checkZone}..${first.checkZone + 6}, result ${hit.checkResult}, progress ${beforeHit} -> hit`);
console.log(`check 2 result ${miss.checkResult}, progress ${beforeMiss} -> ${afterMiss}`);
console.log(`host gen ${hostGen}, guest gen ${guestGen}; corrections ${stats.corrections}`);
console.log(`errors: ${errors.length ? errors.join(" | ") : "none"}`);
console.log(`result text "${hitText}", 1.2 s later "${hitTextLater}"`);
const checks = {
  "a hit says good +3%, then the text goes": hitText === "good +3%" && hitTextLater === "",
  "reached the generator": Math.hypot(parked.x, parked.y - 5e6) < 1.8e6,
  "pressing in the zone is a hit": hit.checkResult === 1,
  "letting it time out is a miss": miss.checkResult === 2,
  "a miss costs progress": afterMiss < beforeMiss,
  "a miss makes the generator loud on the host": loud,
  "the killer HUD names the noise": /NOISE generator 3: \d+ m, \d+° (left|right)/.test(hostHud),
  "host and guest agree on progress": hostGen === guestGen,
  "host and guest agree on the last check": hostP.checkResult === guestP.checkResult && hostP.checkAge === guestP.checkAge,
  "no corrections": stats.corrections === 0,
  "no errors": errors.length === 0,
};
for (const [name, pass] of Object.entries(checks)) console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
