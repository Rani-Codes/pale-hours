// Usage: node drive-lobby.mjs <url> <shot-prefix> [query]
// The lobby in real Chrome, all real clicks and keys. The room creator hosts
// and plays a survivor; guest A picks killer, guest B survivor.
//   1. Start shows only on the host, disabled until every player has a role
//      and there is exactly one killer; a second killer pick is refused.
//   2. Start puts every tab in the match with the picked roles.
//   3. A late joiner is refused with a reason.
//   4. The guest killer moves with prediction (no corrections) and his
//      swing lands on the host's survivor; every tab agrees. The host logs
//      the view lag it judged the swing with, which the sim caps at 200 ms.
//   5. The host, a survivor, moves on its own keys.
import { chromium } from "playwright-core";

const [url = "http://localhost:5173/", prefix = "lobby", query = ""] = process.argv.slice(2);
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
await host.click("#host");
await host.waitForFunction(() => /room [A-Z0-9]{4}/.test(document.querySelector("#netstatus").textContent));
const code = (await host.textContent("#netstatus")).match(/room ([A-Z0-9]{4})/)[1];
const join = async (name) => {
  const page = await open(name);
  await page.fill("#code", code);
  await page.click("#join");
  await page.waitForFunction(() => globalThis.paleSession?.room?.().you > 0, null, { timeout: 15000 });
  return page;
};
const a = await join("A");
const b = await join("B");
const room = (page) => page.evaluate(() => paleSession.room());
const visible = (page, sel) => page.isVisible(sel);
const disabled = (page, sel) => page.evaluate((sel) => document.querySelector(sel).disabled, sel);
await host.waitForFunction(() => paleSession.room().seats.length === 3);

// 1. Picks and the Start button.
const startBefore = { host: await visible(host, "#start"), A: await visible(a, "#start"), disabled: await disabled(host, "#start") };
await a.click("#pick-killer");
await host.waitForFunction(() => paleSession.room().seats.some((s) => s.role === "killer"));
await b.waitForFunction(() => paleSession.room().seats.some((s) => s.role === "killer"));
// The panel redraws every frame; give it one.
const bKillerDisabled = await b.waitForFunction(() => document.querySelector("#pick-killer").disabled, null, { timeout: 2000 }).then(() => true, () => false);
// Ask anyway, the way a stale or hostile tab would: the host must refuse.
const idB = (await room(b)).you;
await b.evaluate(() => paleSession.pick("killer"));
await host.waitForTimeout(400);
const bRole = (await room(host)).seats.find((s) => s.id === idB).role;
await b.click("#pick-survivor");
const problemOneLeft = await host.waitForFunction(() => paleSession.room().problem === "everyone has to pick a role").then(() => true, () => false);
await host.click("#pick-survivor");
await host.waitForFunction(() => !paleSession.room().problem);
await host.screenshot({ path: `${prefix}-host-ready.png` });
await a.screenshot({ path: `${prefix}-A-ready.png` });
const startEnabled = !(await disabled(host, "#start"));

// 2. Start.
await host.click("#start");
for (const page of [host, a, b]) await page.waitForFunction(() => paleSession.room().started, null, { timeout: 10000 });
await host.waitForFunction(() => paleSim.state().tick > 30);
const idA = (await room(a)).you;
const roles = await host.evaluate(() => Object.fromEntries(paleSim.state().players.map((p) => [p.id, p.role])));
const spawnGaps = await host.evaluate((killer) => {
  const { players } = paleSim.state();
  const k = players.find((p) => p.id === killer);
  return players.filter((p) => p.id !== killer).map((p) => Math.max(Math.abs(p.x - k.x), Math.abs(p.y - k.y)) / 1e6);
}, idA);
await host.evaluate((killer) => {
  const s = paleSim.state();
  let side = 0;
  for (const p of s.players) Object.assign(p, p.id === killer ? { x: -10e6, y: 0, trail: undefined } : { x: 10e6, y: 4e6 * side++, trail: undefined });
  paleSim.load(s);
}, idA);
await host.waitForTimeout(700);
const placedCorrections = await a.evaluate(() => paleSession.stats().corrections); // paleSim.load moves count
const panelHidden = !(await visible(a, "#room"));

// 3. A late joiner.
const late = await open("late");
await late.fill("#code", code);
await late.click("#join");
const refused = await late.waitForFunction(() => /refused: the match has already started/.test(document.querySelector("#room-status").textContent), null, { timeout: 15000 }).then(() => true, () => false);
await late.close();

// 4. The guest killer: walk, then swing at the host's survivor.
const M = 1e6;
const killerBefore = await host.evaluate((id) => paleSim.state().players.find((p) => p.id === id), idA);
await a.evaluate(() => (paleLook.yaw = 0));
await a.keyboard.down("KeyW");
await a.waitForTimeout(800);
await a.keyboard.up("KeyW");
await a.waitForTimeout(1200);
const killerWalk = { host: await host.evaluate((id) => paleSim.state().players.find((p) => p.id === id), idA), guest: await a.evaluate(() => paleSession.stats()) };
await host.evaluate(
  ({ idA, k }) => {
    const s = paleSim.state();
    for (const p of s.players) {
      delete p.trail;
      if (p.id === idA) Object.assign(p, { x: k.x, y: k.y });
      if (p.id === 1) Object.assign(p, { x: k.x, y: k.y + 1.5e6, health: 0 });
    }
    paleSim.load(s);
  },
  { idA, k: { x: killerWalk.host.x, y: killerWalk.host.y } },
);
await host.waitForTimeout(1200); // let the move reach A and A's view settle on it
await a.mouse.click(450, 300);
await host.waitForFunction(() => paleSession.swings.length > 0, null, { timeout: 4000 }).catch(() => {});
await host.waitForTimeout(1000);
const swing = await host.evaluate(() => paleSession.swings.at(-1));
const health = { host: await host.evaluate(() => paleSim.state().players.find((p) => p.id === 1).health), A: await a.evaluate(() => paleSim.state().players.find((p) => p.id === 1).health), B: await b.evaluate(() => paleSim.state().players.find((p) => p.id === 1).health) };
await a.screenshot({ path: `${prefix}-A-killer.png` });
await host.screenshot({ path: `${prefix}-host-survivor.png` });

// 5. The host survivor moves.
const hostBefore = await host.evaluate(() => paleSim.state().players.find((p) => p.id === 1));
await host.keyboard.down("KeyD");
await host.waitForTimeout(500);
await host.keyboard.up("KeyD");
const hostAfter = await host.evaluate(() => paleSim.state().players.find((p) => p.id === 1));
await browser.close();

console.log(JSON.stringify({ startBefore, bKillerDisabled, bRole, startEnabled, roles, refused, killerMoved: (killerWalk.host.y - killerBefore.y) / M, killerCorrections: killerWalk.guest.corrections - placedCorrections, swing: swing && { hit: swing.hit, viewLagMs: swing.viewLagMs }, health }));
console.log(`errors: ${errors.length ? errors.join(" | ") : "none"}`);
const checks = {
  "Start shows only on the host, disabled at first": startBefore.host && !startBefore.A && startBefore.disabled,
  "a taken killer slot greys out for others": bKillerDisabled,
  "the host refuses a second killer": bRole === undefined,
  "Start waits for everyone to pick": problemOneLeft,
  "Start enables once the lobby is valid": startEnabled,
  "the match starts with the picked roles": roles[idA] === 1 && roles[1] === 0 && roles[idB] === 0,
  "the panel goes away in the match": panelHidden,
  "every survivor spawns at least 5 m from the killer, on x or y": spawnGaps.length === 2 && spawnGaps.every((g) => g >= 5),
  "a late joiner is refused with a reason": refused,
  "the guest killer moves": killerWalk.host.y - killerBefore.y > 2e6,
  "the guest killer's prediction needed no corrections": killerWalk.guest.corrections === placedCorrections,
  "the guest killer's swing lands on the host survivor": swing?.hit === true,
  "every tab agrees the host survivor is injured": health.host === 1 && health.A === 1 && health.B === 1,
  "the host survivor moves on its own keys": hostAfter.x - hostBefore.x > 1e6,
  "no errors": errors.length === 0,
};
for (const [name, pass] of Object.entries(checks)) console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
