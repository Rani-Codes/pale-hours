// Usage: node drive-crouch.mjs <url> <shot-prefix> [query]
// Killer hosts, a survivor joins. Setup places both near the grass patch at
// x 4..10, y 8..14 through paleSim.load; the rest is real keys.
//   1. Holding C in grass settles into hiding: host and guest agree, no corrections.
//   2. The killer, far off, no longer sees the survivor: his HUD list says so.
//   3. Within reach of the reveal range the survivor shows again.
//   4. Letting go of C stands them up and shows them.
//   5. Crouching in the open hides nobody; crouched walking is slow.
import { chromium } from "playwright-core";
import { startMatch } from "./lib/lobby.mjs";

const [url = "http://localhost:5173/", prefix = "crouch", query = ""] = process.argv.slice(2);
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
const place = (changes) =>
  host.evaluate((changes) => {
    const s = paleSim.state();
    for (const p of s.players) if (changes[p.id]) Object.assign(p, changes[p.id], { trail: undefined });
    paleSim.load(s);
  }, changes);
const on = (page, pid) => page.evaluate((pid) => paleSim.state().players.find((p) => p.id === pid), pid);
const settle = (ms = 700) => host.waitForTimeout(ms);
const hostHud = () => host.textContent("#hud");
const settleTicks = await host.evaluate(() => paleSim.hideSettleTicks);
const corrections = () => guest.evaluate(() => paleSession.stats().corrections);

// The killer is 10 m from the patch, looking at it.
await host.evaluate(() => (paleLook.yaw = -0.588));
await place({ 1: { x: 13 * M, y: 2 * M }, [id]: { x: 7 * M, y: 11 * M } });
await settle();
const before = await corrections();
const seenStanding = /survivor x/.test(await hostHud());

// 1 and 2. Crouch in the grass.
await guest.keyboard.down("KeyC");
await settle(1200);
const hid = { host: await on(host, id), guest: await on(guest, id) };
const unseen = /out of sight/.test(await hostHud());
const hint = await guest.textContent("#hud");
await host.screenshot({ path: `${prefix}-killer-far.png` });
await guest.screenshot({ path: `${prefix}-survivor-hidden.png` });
const afterCrouch = await corrections();

// 3. The killer walks up.
await place({ 1: { x: 10 * M, y: 8 * M } });
await settle();
const seenClose = /survivor x/.test(await hostHud());
await host.screenshot({ path: `${prefix}-killer-close.png` });
await place({ 1: { x: 13 * M, y: 2 * M } });
await settle();

// 4. Stand up.
await guest.keyboard.up("KeyC");
await settle(500);
const up = await on(host, id);
const seenUp = /survivor x/.test(await hostHud());

// 5. In the open: no cover, and slow.
await place({ [id]: { x: 16 * M, y: -8 * M } });
await settle();
await guest.keyboard.down("KeyC");
await settle(900);
const open1 = await on(host, id);
const from = await on(host, id);
await guest.keyboard.down("KeyW");
await host.waitForTimeout(1000);
await guest.keyboard.up("KeyW");
const to = await on(host, id);
await guest.keyboard.up("KeyC");
const crouchedM = (to.y - from.y) / M;
await place({ [id]: { x: 16 * M, y: -8 * M } });
await settle();
const walkFrom = await on(host, id);
await guest.keyboard.down("KeyW");
await host.waitForTimeout(1000);
await guest.keyboard.up("KeyW");
const walkedM = ((await on(host, id)).y - walkFrom.y) / M;
await browser.close();

console.log(JSON.stringify({ settleTicks, hid: [hid.host.crouching, hid.host.hideTicks, hid.guest.hideTicks], crouchedM, walkedM, corrections: afterCrouch - before }));
console.log(`errors: ${errors.length ? errors.join(" | ") : "none"}`);
const checks = {
  "standing in the grass is seen": seenStanding,
  "holding C in grass hides the survivor on the host": hid.host.crouching && hid.host.hideTicks >= settleTicks,
  "the guest predicts the same": hid.guest.crouching && hid.guest.hideTicks === hid.host.hideTicks,
  "no corrections from crouching": afterCrouch - before === 0,
  "the survivor is told they are hidden": /hidden: the killer/.test(hint),
  "the far killer cannot see them": unseen,
  "the close killer can": seenClose,
  "standing up shows them": !up.crouching && up.hideTicks === 0 && seenUp,
  "crouching in the open hides nobody": open1.crouching && open1.hideTicks === 0,
  "crouched walking is slow": crouchedM > 0.8 && crouchedM < 2.5 && walkedM > 2 * crouchedM * 0.9,
  "no errors": errors.length === 0,
};
for (const [name, pass] of Object.entries(checks)) console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
