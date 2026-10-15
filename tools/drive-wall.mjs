// Usage: node drive-wall.mjs <url> <shot-prefix> [query]
// Host and guest tabs in real Chrome. The guest walks east, then south into a
// wall, and holds the key. The host and the guest's prediction must agree
// exactly on where it stops, the stop must be the wall face, and the guest
// must have needed no reconciliation corrections.
import { chromium } from "playwright-core";

const [url = "http://localhost:5173/", prefix = "wall", query = ""] = process.argv.slice(2);
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

const selfId = await guest.evaluate(() => paleSession.stats().selfId);
await guest.bringToFront();
await guest.keyboard.down("KeyD");
await guest.waitForTimeout(1000);
await guest.keyboard.up("KeyD");
await guest.keyboard.down("KeyS");
await guest.waitForTimeout(3500); // 9.35 m at 4 m/s is 2.3 s, then it keeps pushing into the wall
await guest.keyboard.up("KeyS");
await guest.waitForTimeout(1500); // let the host's last snapshot land

const pos = (page) => page.evaluate((id) => paleSim.state().players.find((p) => p.id === id), selfId);
const [h, g] = [await pos(host), await pos(guest)];
const stats = await guest.evaluate(() => paleSession.stats());
await host.screenshot({ path: `${prefix}-host.png` });
await guest.screenshot({ path: `${prefix}-guest.png` });
await browser.close();

// Wall hWall(12, 16, -10) spans y -10.25..-9.75 m; the body is 0.4 m, so it stops at y = -9.35 m.
const wantY = -9_350_000;
console.log(`host  player ${selfId}: x ${h.x} y ${h.y}`);
console.log(`guest player ${selfId}: x ${g.x} y ${g.y}`);
console.log(`corrections ${stats.corrections}`);
console.log(`errors: ${errors.length ? errors.join(" | ") : "none"}`);
const checks = {
  "host and guest agree": h.x === g.x && h.y === g.y,
  "stopped at the wall face": h.y === wantY,
  "passed the starting x": h.x > 13_000_000,
  "no corrections": stats.corrections === 0,
  "no errors": errors.length === 0,
};
for (const [name, pass] of Object.entries(checks)) console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
