// Usage: node drive-look-killer.mjs <url> <shot-prefix>
// Art review of the killer and survivor animations in third person. The
// killer hosts; survivor A is the one acted on; survivor B is the camera,
// turned with paleLook. Players are placed through paleSim.load on the host.
// Swings and pickups are real clicks and keys.
import { chromium } from "playwright-core";
import { startMatch } from "./lib/lobby.mjs";

const [url = "http://localhost:5173/", prefix = "killer"] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome", args: ["--disable-features=WebRtcHideLocalIpsWithMdns"] });
const context = await browser.newContext({ viewport: { width: 960, height: 600 } });
const errors = [];
const open = async (name) => {
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${name}: ${m.text()}`));
  await page.goto(url);
  await page.waitForFunction(() => globalThis.paleSim);
  return page;
};
const linked = () => /rtt reliable/.test(document.querySelector("#netstatus").textContent);
const host = await open("host");
await host.click("#host");
await host.waitForFunction(() => /room [A-Z0-9]{4}/.test(document.querySelector("#netstatus").textContent));
const code = (await host.textContent("#netstatus")).match(/room ([A-Z0-9]{4})/)[1];
const join = async (name) => {
  const page = await open(name);
  await page.fill("#code", code);
  await page.click("#join");
  await page.waitForFunction(linked, null, { timeout: 15000 });
  await page.waitForFunction(() => globalThis.paleSession?.stats?.().selfId);
  return page;
};
const a = await join("A");
const b = await join("B");
const [idA, idB] = [await a.evaluate(() => paleSession.stats().selfId), await b.evaluate(() => paleSession.stats().selfId)];
await startMatch(host, [a, b]);
await host.waitForFunction(() => paleSim.state().tick > 30);
const M = 1e6;
const place = (changes) =>
  host.evaluate((changes) => {
    const s = paleSim.state();
    for (const p of s.players) if (changes[p.id]) Object.assign(p, changes[p.id], { trail: undefined });
    paleSim.load(s);
  }, changes);
// B stands south of the spot looking north at it from a few meters; the killer faces B.
const SPOT = { x: 6, y: -6 };
const shot = (name) => b.screenshot({ path: `${prefix}-${name}.png` });
// B stands off the killer's left front and looks at him, so B's own body is not in the way.
await b.evaluate(() => (paleLook.yaw = Math.atan2(1.6, 2.2) + 0.45));
await host.evaluate(() => (paleLook.yaw = Math.PI)); // the killer faces south, toward B

await place({ 1: { x: SPOT.x * M, y: SPOT.y * M }, [idA]: { x: (SPOT.x + 2.5) * M, y: (SPOT.y + 3) * M }, [idB]: { x: (SPOT.x - 1.6) * M, y: (SPOT.y - 2.2) * M } });
await b.waitForTimeout(1500);
await shot("idle");
// B draws the killer through its interpolation delay, so wait for B's own view of each phase.
const killerSwing = (phase) => b.waitForFunction((phase) => paleSession.view(performance.now(), 0).players.find((p) => p.id === 1)?.swing === phase, phase, { polling: "raf", timeout: 3000 });
await host.mouse.click(480, 300);
await killerSwing(1);
await b.waitForTimeout(140);
await shot("windup");
await killerSwing(2);
await b.waitForTimeout(40);
await shot("strike");
await b.waitForTimeout(1300);

// The killer's own first-person view of a swing.
await host.mouse.click(480, 300);
await host.waitForTimeout(150);
await host.screenshot({ path: `${prefix}-fp-windup.png` });
await host.waitForFunction(() => paleSim.state().players.find((p) => p.id === 1).swing === 2, null, { polling: "raf" });
await host.waitForTimeout(50);
await host.screenshot({ path: `${prefix}-fp-strike.png` });
await host.waitForTimeout(1300);

// The killer walks toward B.
await host.keyboard.down("KeyW");
await b.waitForTimeout(450);
await shot("walk");
await host.keyboard.up("KeyW");
await place({ 1: { x: SPOT.x * M, y: SPOT.y * M } });

// A goes down next to the killer and crawls; then the killer picks A up.
await place({ [idA]: { x: (SPOT.x + 1.2) * M, y: (SPOT.y - 0.5) * M, health: 2, recover: 0 } });
await a.evaluate(() => (paleLook.yaw = -Math.PI / 2));
await a.keyboard.down("KeyW");
await b.waitForTimeout(900);
await shot("crawl");
await a.keyboard.up("KeyW");
await host.keyboard.press("KeyE");
await b.waitForTimeout(700);
await shot("carry");
await host.keyboard.down("KeyW"); // and carrying on the move
await b.waitForTimeout(500);
await shot("carry-walk");
await host.keyboard.up("KeyW");
await host.keyboard.press("KeyE"); // drop
await b.waitForTimeout(300);

// A, healthy, works on the generator at (0, 5) while B watches.
await place({ [idA]: { x: 0, y: 3.6 * M, health: 0, carried: false }, [idB]: { x: -0.5 * M, y: -0.5 * M } });
await a.keyboard.down("KeyE");
await b.waitForTimeout(800);
await shot("repair");
await a.keyboard.up("KeyE");
// The killer, from the survivor's side, injured A running.
await place({ [idA]: { x: (SPOT.x - 1) * M, y: (SPOT.y + 1) * M, health: 1 }, [idB]: { x: SPOT.x * M, y: (SPOT.y - 4.2) * M } });
await a.evaluate(() => (paleLook.yaw = Math.PI / 2));
await a.keyboard.down("KeyW");
await b.waitForTimeout(500);
await shot("limp");
await a.keyboard.up("KeyW");
await browser.close();
console.log(`errors: ${errors.length ? errors.join(" | ") : "none"}`);
process.exit(errors.length ? 1 : 0);
