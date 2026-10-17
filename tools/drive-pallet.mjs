// Usage: node drive-pallet.mjs <url> <shot-prefix> [query]
// Killer hosts, a survivor joins. Setup places both beside the pallets in the
// doorways of building A (palletSites 0 and 1) through paleSim.load; the rest
// is real keys.
//   1. A standing pallet is walked through by the killer.
//   2. The survivor is told Space throws it down; Space drops it on both tabs
//      and the killer 2 m behind is stunned for 3 s: he cannot move, then can.
//   3. A dropped pallet blocks the killer; holding E breaks it in 3 s (the
//      prompt counts it down), after which he walks through.
//   4. A pallet is thrown once: a broken one stays broken and Space does nothing.
//   6. Space throws it from 2.6 m out and from standing in the doorway.
//   5. The survivor vaults a dropped pallet and lands on the far side, host
//      and guest agreeing, with no corrections.
import { chromium } from "playwright-core";
import { startMatch } from "./lib/lobby.mjs";

const [url = "http://localhost:5173/", prefix = "pallet", query = ""] = process.argv.slice(2);
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
const [startCorrections] = await startMatch(host, [guest]);

const M = 1e6;
const place = (changes) =>
  host.evaluate((changes) => {
    const s = paleSim.state();
    for (const p of s.players) if (changes[p.id]) Object.assign(p, changes[p.id], { trail: undefined });
    paleSim.load(s);
  }, changes);
const setPallet = (i, state) =>
  host.evaluate(([i, state]) => {
    const s = paleSim.state();
    s.pallets[i] = state;
    s.palletBreak[i] = 0;
    paleSim.load(s);
  }, [i, state]);
const on = (page, pid) => page.evaluate((pid) => paleSim.state().players.find((p) => p.id === pid), pid);
const pallets = (page) => page.evaluate(() => paleSim.state().pallets);
const settle = (ms = 800) => host.waitForTimeout(ms);
const corrections = () => guest.evaluate(() => paleSession.stats().corrections);
const hold = async (page, key, ms) => {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
};
await guest.evaluate(() => (paleLook.yaw = 0));
await host.evaluate(() => (paleLook.yaw = 0));
const stunTicks = await host.evaluate(() => paleSim.palletStunTicks);

const pal = await host.evaluate(() => paleSim.palletSites);
const door = pal[1]; // building A, south doorway: x -16..-14, y 8
const midX = (door.minX + door.maxX) / 2;
const southOf = (m) => door.minY - m * M;
const far = { x: 20 * M, y: -20 * M };

// 1. A standing pallet is no obstacle.
await place({ 1: { x: midX, y: southOf(1.1) }, [id]: far });
await settle();
await hold(host, "KeyW", 1200);
const through = await on(host, 1);

// 2. Throw it down with the killer two metres behind.
await setPallet(1, 0);
await place({ 1: { x: midX, y: southOf(3) }, [id]: { x: midX, y: southOf(1.1) } });
await settle();
const prompt = await guest.textContent("#hud");
const before = await corrections();
await guest.keyboard.press("Space");
await settle(500);
const down = { host: (await pallets(host))[1], guest: (await pallets(guest))[1] };
const stunned = await on(host, 1);
const killerHud = await host.textContent("#hud");
await host.screenshot({ path: `${prefix}-killer-stunned.png` });
await guest.screenshot({ path: `${prefix}-survivor-dropped.png` });
const at = await on(host, 1);
await hold(host, "KeyD", 1000);
const stillStunned = await on(host, 1);
await host.waitForTimeout((stunTicks / 30) * 1000 - 1500 + 400);
await hold(host, "KeyD", 600);
const free = await on(host, 1);
const afterDrop = (await corrections()) - before;

// 3. The dropped pallet blocks him; E breaks it.
await place({ 1: { x: midX, y: southOf(1.1) }, [id]: far });
await settle();
await hold(host, "KeyW", 800);
const blocked = await on(host, 1);
await host.keyboard.down("KeyE");
await host.waitForTimeout(1500);
const breakHud = await host.textContent("#hud");
const progress = (await host.evaluate(() => paleSim.state().palletBreak))[1];
await host.screenshot({ path: `${prefix}-breaking.png` });
await guest.screenshot({ path: `${prefix}-survivor-sees-breaking.png` });
await host.waitForTimeout(2200);
await host.keyboard.up("KeyE");
await settle(300);
const broken = { host: (await pallets(host))[1], guest: (await pallets(guest))[1] };
await host.screenshot({ path: `${prefix}-broken.png` });
await hold(host, "KeyW", 1200);
const afterBreak = await on(host, 1);

// 4. Thrown once.
await place({ 1: far, [id]: { x: midX, y: southOf(1.1) } });
await settle();
await guest.keyboard.press("Space");
await settle(600);
const again = { state: (await pallets(host))[1], vaulting: (await on(host, id)).vaultTicks };

// 5. Vault a dropped pallet (building A, north doorway).
const north = pal[0];
const nx = (north.minX + north.maxX) / 2;
await setPallet(0, 0);
await place({ 1: far, [id]: { x: nx, y: north.minY - 0.8 * M } }); // vaulting needs to be within a metre
await settle();
await guest.keyboard.press("Space"); // throws it
await settle(400);
const vaultPrompt = await guest.textContent("#hud");
const c0 = await corrections();
await guest.keyboard.press("Space"); // vaults it
await settle(1200);
const landed = { host: await on(host, id), guest: await on(guest, id) };
const vaultCorrections = (await corrections()) - c0;
await guest.screenshot({ path: `${prefix}-survivor-vaulted.png` });
// 6. A generous reach: Space from 2.6 m out throws it, standing in the doorway throws it too.
await setPallet(1, 0);
await place({ 1: far, [id]: { x: midX, y: southOf(2.6) } });
await settle();
const farPrompt = await guest.textContent("#hud");
await guest.keyboard.press("Space");
await settle(500);
const farThrow = (await pallets(host))[1];
await setPallet(1, 0);
await place({ 1: far, [id]: { x: midX, y: (door.minY + door.maxY) / 2 } });
await settle();
await guest.keyboard.press("Space");
await settle(500);
const inThrow = { state: (await pallets(host))[1], pos: await on(host, id) };
await browser.close();

console.log(JSON.stringify({ through: through.y / M, wall: door.maxY / M, down, stun: stunned.stun, stillStunned: stillStunned.stun, blocked: blocked.y / M, progress, broken, afterBreak: afterBreak.y / M, again, landedY: landed.host.y / M, afterDrop, vaultCorrections }));
console.log(`errors: ${errors.length ? errors.join(" | ") : "none"}`);
const checks = {
  "a standing pallet does not block the killer": through.y > door.maxY + 0.4 * M,
  "the survivor is told to throw it down": /Space to throw down the pallet/.test(prompt),
  "Space throws it down, on both tabs": down.host === 1 && down.guest === 1,
  "the killer behind it is stunned for 3 s": stunned.stun >= stunTicks - 30 && stunned.stun <= stunTicks, // read half a second after the drop
  "the killer is told he is stunned": /STUNNED/.test(killerHud),
  "a stunned killer cannot move": stillStunned.x === at.x && stillStunned.y === at.y,
  "he moves again once it wears off": free.x > at.x,
  "no corrections from the drop": afterDrop === 0,
  "a dropped pallet blocks the killer": blocked.y <= door.minY - 0.4 * M,
  "holding E counts the break down": /breaking the pallet: \d s/.test(breakHud) && progress > 0,
  "the pallet breaks after 3 s, on both tabs": broken.host === 2 && broken.guest === 2,
  "he walks through a broken pallet": afterBreak.y > door.maxY + 0.4 * M,
  "a broken pallet stays broken and Space does nothing": again.state === 2 && again.vaulting === 0,
  "a dropped pallet offers the vault": /Space to vault/.test(vaultPrompt),
  "the survivor vaults it and lands past it": landed.host.y > north.maxY + 0.4 * M,
  "host and guest agree on the landing": landed.guest.x === landed.host.x && landed.guest.y === landed.host.y,
  "no corrections from the vault": vaultCorrections === 0,
  "the prompt shows from 2.6 m out": /Space to throw down the pallet/.test(farPrompt),
  "Space throws it from 2.6 m out": farThrow === 1,
  "Space throws it from standing in the doorway, and pushes them out": inThrow.state === 1 && (inThrow.pos.y <= door.minY - 0.4 * M || inThrow.pos.y >= door.maxY + 0.4 * M),
  "no errors": errors.length === 0,
};
for (const [name, pass] of Object.entries(checks)) console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
