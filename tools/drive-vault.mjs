// Usage: node drive-vault.mjs <url> <shot-prefix> [query]
// Killer hosts, a survivor joins. Setup places both beside the window in the
// loop west of the centre (x = -4 m, y 4..6 m) through paleSim.load; the rest
// is real keys and clicks.
//   1. The survivor is offered the vault, presses Space, and lands on the far
//      side; host and guest agree exactly, with no corrections.
//   2. Walking into the window without Space is blocked.
//   3. The killer cannot walk through it, and Space does nothing for him.
//   4. The killer's swing does not reach a survivor across it.
import { chromium } from "playwright-core";
import { startMatch } from "./lib/lobby.mjs";

const [url = "http://localhost:5173/", prefix = "vault", query = ""] = process.argv.slice(2);
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
const linked = () => /rtt reliable/.test(document.querySelector("#netstatus").textContent);
const host = await open("host");
await host.click("#host");
await host.waitForFunction(() => /room [A-Z0-9]{4}/.test(document.querySelector("#netstatus").textContent));
const code = (await host.textContent("#netstatus")).match(/room ([A-Z0-9]{4})/)[1];
const guest = await open("guest");
await guest.fill("#code", code);
await guest.click("#join");
await guest.waitForFunction(linked, null, { timeout: 15000 });
await guest.waitForFunction(() => globalThis.paleSession?.stats?.().selfId);
const id = await guest.evaluate(() => paleSession.stats().selfId);
await startMatch(host, [guest]);
await host.waitForFunction(() => paleSim.state().tick > 30);

const M = 1e6;
const v = await host.evaluate(() => paleSim.vaults.find((b) => b.minX < -3.5e6 && b.maxX > -4.5e6 && b.minY > 3e6));
const westX = v.minX - 0.4 * M - 0.2 * M;
const eastLand = v.maxX + 0.4 * M + 0.05 * M;
const y = (v.minY + v.maxY) / 2;
const place = (changes) =>
  host.evaluate((changes) => {
    const s = paleSim.state();
    for (const p of s.players) if (changes[p.id]) Object.assign(p, changes[p.id], { trail: undefined });
    paleSim.load(s);
  }, changes);
const on = (page, pid) => page.evaluate((pid) => paleSim.state().players.find((p) => p.id === pid), pid);
const settle = (ms = 800) => host.waitForTimeout(ms);
// Both face east, so W walks toward the window.
await guest.evaluate(() => (paleLook.yaw = Math.PI / 2));
await host.evaluate(() => (paleLook.yaw = Math.PI / 2));

// 2 first: walking into the window is blocked.
await place({ 1: { x: -12 * M, y: 0 }, [id]: { x: westX, y } });
await settle();
await guest.keyboard.down("KeyW");
await guest.waitForTimeout(700);
await guest.keyboard.up("KeyW");
await settle();
const walked = await on(host, id);
const offered = /Space to vault/.test(await guest.textContent("#hud"));

// 1. Vault.
const before = await guest.evaluate(() => paleSession.stats().corrections);
await guest.keyboard.press("Space");
await guest.waitForTimeout(250);
await host.screenshot({ path: `${prefix}-host-mid.png` });
await settle(1000);
const landed = { host: await on(host, id), guest: await on(guest, id) };
const corrections = (await guest.evaluate(() => paleSession.stats().corrections)) - before;
await guest.screenshot({ path: `${prefix}-guest-landed.png` });

// 3. The killer at the same window.
await place({ 1: { x: westX, y }, [id]: { x: eastLand + 3 * M, y } });
await settle();
await host.keyboard.press("Space");
await host.keyboard.down("KeyW");
await host.waitForTimeout(700);
await host.keyboard.up("KeyW");
await settle(300);
const killer = await on(host, 1);

// 4. A swing across the window finds nothing: it is a wall to him, and he cannot pick someone up across it either.
await place({ 1: { x: westX, y }, [id]: { x: eastLand, y, health: 0 } });
await settle();
await host.mouse.click(450, 300);
await settle();
const hit = { host: (await on(host, id)).health, guest: (await on(guest, id)).health };
await browser.close();

console.log(JSON.stringify({ walkedX: walked.x / M, faceX: (v.minX - 0.4 * M) / M, landed: [landed.host.x / M, landed.guest.x / M], wantX: eastLand / M, corrections, killerX: killer.x / M, hit }));
console.log(`errors: ${errors.length ? errors.join(" | ") : "none"}`);
const checks = {
  "walking into the window is blocked": walked.x <= v.minX - 0.4 * M,
  "the survivor is offered the vault": offered,
  "Space carries the survivor over": landed.host.x === eastLand && landed.host.y === y,
  "host and guest agree on the landing": landed.guest.x === landed.host.x && landed.guest.y === landed.host.y,
  "no corrections from the vault": corrections === 0,
  "the killer cannot get through": killer.x <= v.minX - 0.4 * M && killer.vaultTicks === 0,
  "the swing does not reach across the window, on both tabs": hit.host === 0 && hit.guest === 0,
  "no errors": errors.length === 0,
};
for (const [name, pass] of Object.entries(checks)) console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
