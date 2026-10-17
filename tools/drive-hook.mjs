// Usage: node drive-hook.mjs <url> <shot-prefix> [query]
// The killer hosts; survivors A (id 2) and B (id 3) join from two more tabs.
// Setup through paleSim.load on the host only places players, downs a
// survivor (the attack has its own driver), or fast-forwards a long timer.
// Every action is a real key: E, Space, and movement.
//   1. B holds E beside downed A and hits the skill check: A stands up injured.
//   2. A's health bar shows 0 squares downed, 1 injured, 2 healthy.
//   3. The killer picks A up, walks to a hook carrying them, and hangs them.
//   3b. On the hook A gets skill checks: letting one time out costs 5 s of
//       hook time, a good press costs nothing.
//   4. B holds E at the hook: A comes down injured, hook time kept.
//   5. Hung again with one second of hook time left, A is eliminated.
//   5b. Carried a second from getting up, B breaks free injured and the
//       killer is stunned.
//   6. B, downed and left alone with one second to go, stands up injured.
import { chromium } from "playwright-core";
import { startMatch } from "./lib/lobby.mjs";

const [url = "http://localhost:5173/", prefix = "hook", query = ""] = process.argv.slice(2);
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
const HOOK = await host.evaluate(() => paleSim.hookSites[2]); // (-16, 0) m, in open ground near the killer's spawn
const place = (changes) =>
  host.evaluate((changes) => {
    const s = paleSim.state();
    for (const p of s.players) {
      const c = changes[p.id];
      if (!c) continue;
      if (c.x !== undefined) delete p.trail;
      Object.assign(p, c);
    }
    paleSim.load(s);
  }, changes);
const on = (page, id) => page.evaluate((id) => paleSim.state().players.find((p) => p.id === id), id);
const everywhere = async (id) => Promise.all([host, a, b].map((page) => on(page, id)));
const pips = (page) => page.$$eval("#health .pip.full", (els) => els.length);
const settle = (ms = 900) => host.waitForTimeout(ms);
const results = {};

// 1 and 2. B gets A up with a skill check.
await place({
  1: { x: HOOK.x + 12 * M, y: HOOK.y - 6 * M },
  [idA]: { x: HOOK.x + 4 * M, y: HOOK.y + 1 * M, health: 2, recover: 0 },
  [idB]: { x: HOOK.x + 4 * M, y: HOOK.y + 2.2 * M, health: 0 },
});
await settle();
results.pipsDowned = await pips(a);
const holdAt = Date.now();
await b.keyboard.down("KeyE");
await b.waitForFunction(() => paleSession.stats().predicted?.checkActive, null, { timeout: 3000, polling: 5 });
const checkAfterMs = Date.now() - holdAt;
await b.waitForFunction(() => {
  const p = paleSession.stats().predicted;
  return p.checkAge >= p.checkZone + 1;
}, null, { polling: 5 });
await b.keyboard.press("Space");
await settle();
await b.keyboard.up("KeyE");
await settle();
results.helped = (await everywhere(idA)).map((p) => p.health);
results.pipsInjured = await pips(a);
await a.screenshot({ path: `${prefix}-A-helped.png` });

// 3. Pick up, carry west to the hook, hang.
await place({
  1: { x: HOOK.x + 4 * M, y: HOOK.y },
  [idA]: { x: HOOK.x + 4 * M, y: HOOK.y + 1 * M, health: 2, recover: 0 },
  [idB]: { x: HOOK.x + 8 * M, y: HOOK.y + 6 * M },
});
await settle();
await host.keyboard.press("KeyE");
await settle(400);
results.carried = (await everywhere(idA)).map((p) => p.carried);
const killerHud = await host.textContent("#hud");
await host.keyboard.down("KeyA"); // the killer faces north, so A walks west toward the hook
await host.waitForFunction((hx) => paleSim.state().players.find((p) => p.id === 1).x < hx + 1.6e6, HOOK.x, { timeout: 5000, polling: 10 });
await host.keyboard.up("KeyA");
const carriedAtHook = await on(host, idA);
const killerAtHook = await on(host, 1);
await host.keyboard.press("KeyE");
const hungAt = Date.now();
await settle();
results.hooked = (await everywhere(idA)).map((p) => p.onHook);
// The other survivor is shown where for 3 s; the hooked one and the killer are not.
const alertHuds = { B: await b.textContent("#hud"), A: await a.textContent("#hud"), host: await host.textContent("#hud") };
await b.evaluate((yaw) => (paleLook.yaw = yaw), Math.atan2(-8, -6)); // B stands 8 m east and 6 m north of the hook
await b.waitForTimeout(100);
await b.screenshot({ path: `${prefix}-B-hook-alert.png` });
await b.waitForTimeout(Math.max(0, hungAt + 3700 - Date.now()));
const alertAfter = await b.textContent("#hud");
results.pipsHooked = await pips(a);
const hookedHud = await a.textContent("#hud");
await host.screenshot({ path: `${prefix}-host-hooked.png` });
await a.screenshot({ path: `${prefix}-A-hooked.png` });

const recoverTicksAll = await host.evaluate(() => paleSim.recoverTicks);

// 3b. Hook skill checks. Setup brings the next check close instead of waiting up to 9 s.
const penalty = await host.evaluate(() => paleSim.hookCheckPenalty);
const snapA = () => host.evaluate((id) => {
  const s = paleSim.state();
  return { tick: s.tick, ...s.players.find((p) => p.id === id) };
}, idA);
const hookCheck = async (press) => {
  await place({ [idA]: { checkIn: 3 } });
  // The guest predicts itself a few ticks ahead, so the host is the one to wait for.
  await host.waitForFunction((id) => paleSim.state().players.find((p) => p.id === id).checkActive, idA, { timeout: 3000, polling: 5 });
  const before = await snapA();
  if (press) {
    await a.waitForFunction(() => {
      const p = paleSession.stats().predicted;
      return p.checkActive && p.checkAge >= p.checkZone + 1;
    }, null, { polling: 5 });
    await a.keyboard.press("Space");
  }
  await host.waitForFunction((id) => !paleSim.state().players.find((p) => p.id === id).checkActive, idA, { timeout: 3000, polling: 5 });
  const after = await snapA();
  await settle(600);
  // Hook time grows a tick per tick; the guest is a few ticks ahead, so compare it net of the tick.
  const net = (page) => page.evaluate((id) => {
    const s = paleSim.state();
    return { used: s.players.find((p) => p.id === id).hookUsed - s.tick, result: s.players.find((p) => p.id === id).checkResult };
  }, idA);
  const [onHost, onGuest] = [await net(host), await net(a)];
  // Hook time used beyond the ticks that passed is what the check cost.
  const brief = (p) => ({ tick: p.tick, used: p.hookUsed, active: p.checkActive, age: p.checkAge, zone: p.checkZone, result: p.checkResult, onHook: p.onHook });
  return { before: brief(before), after: brief(after), cost: after.hookUsed - before.hookUsed - (after.tick - before.tick), result: after.checkResult, guestResult: onGuest.result, agree: onHost.used === onGuest.used };
};
const hookMiss = await hookCheck(false);
const hookHit = await hookCheck(true);

// 4. B rescues.
await place({ [idB]: { x: HOOK.x + 1 * M, y: HOOK.y - 1 * M } });
await settle();
await b.keyboard.down("KeyE");
await b.waitForTimeout(1600);
await b.keyboard.up("KeyE");
await settle();
const rescued = await everywhere(idA);
results.rescued = rescued.map((p) => `${p.onHook}/${p.health}`);
results.hookUsedKept = rescued[0].hookUsed > 0;
results.pipsRescued = await pips(a);

// 5. Hung again with a second to go.
await place({
  1: { x: HOOK.x + 1 * M, y: HOOK.y },
  [idA]: { x: HOOK.x + 1 * M, y: HOOK.y + 1 * M, health: 2 },
  [idB]: { x: HOOK.x + 8 * M, y: HOOK.y + 6 * M },
});
await settle();
await host.keyboard.press("KeyE");
await settle(400);
await host.keyboard.press("KeyE");
await settle(300);
const hookTicks = await host.evaluate(() => paleSim.hookTicks);
await place({ [idA]: { hookUsed: hookTicks - 30 } });
await host.waitForTimeout(2000);
results.eliminated = (await everywhere(idA)).map((p) => p.eliminated);
results.eliminatedHud = /you died on the hook/.test(await a.textContent("#hud"));

// 5b. Carried too long.
await place({
  1: { x: HOOK.x + 8 * M, y: HOOK.y - 6 * M, stun: 0 },
  [idB]: { x: HOOK.x + 8 * M, y: HOOK.y - 5 * M, health: 2, recover: recoverTicksAll - 45 },
});
await settle(300);
await host.keyboard.press("KeyE");
const pickedUp = await host.waitForFunction((id) => paleSim.state().players.find((p) => p.id === id).carried, idB, { timeout: 2000, polling: 5 }).then(() => true, () => false);
const stunned = await host.waitForFunction(() => paleSim.state().players.find((p) => p.id === 1).stun > 0, null, { timeout: 4000, polling: 5 }).then(() => true, () => false);
const killerHudStunned = await host.textContent("#hud");
const stunStart = await on(host, 1);
await host.keyboard.down("KeyD");
await host.waitForTimeout(500);
const stuckPos = await on(host, 1);
await host.waitForTimeout(1900); // the stun is 1.5 s
await host.keyboard.up("KeyD");
const freedPos = await on(host, 1);
await settle();
results.brokeFree = (await everywhere(idB)).map((p) => `${p.carried}/${p.health}`);
results.pipsBrokeFree = await pips(b);

// 5c. Struggling on the shoulder: E then Q, alternating. Mashing one key does nothing.
await place({ 1: { x: HOOK.x + 8 * M, y: HOOK.y - 6 * M, stun: 0, carrying: 0 }, [idB]: { x: HOOK.x + 8 * M, y: HOOK.y - 5 * M, health: 2, recover: 300, carried: false } });
await settle(400);
await host.keyboard.press("KeyE");
await host.waitForFunction((id) => paleSim.state().players.find((p) => p.id === id).carried, idB, { timeout: 2000, polling: 5 });
await b.waitForTimeout(400); // the carry has to reach B's tab
const struggleHud = await b.textContent("#hud");
const r0 = (await on(host, idB)).recover;
for (let i = 0; i < 8; i++) {
  await b.keyboard.press("KeyE");
  await b.waitForTimeout(60);
}
const r1 = (await on(host, idB)).recover;
for (let i = 0; i < 16; i++) {
  await b.keyboard.press(i % 2 ? "KeyE" : "KeyQ");
  await b.waitForTimeout(60);
}
const r2 = (await on(host, idB)).recover;
const struggleStart = Date.now();
let presses = 0;
while ((await on(host, idB)).carried && presses < 120) {
  await b.keyboard.press(presses % 2 ? "KeyQ" : "KeyE");
  await b.waitForTimeout(60);
  presses++;
}
const struggleMs = Date.now() - struggleStart;
const struggleStun = (await on(host, 1)).stun;
results.struggled = { mash: r1 - r0, alternated: r2 - r1, freeAfterMs: struggleMs, carried: (await on(host, idB)).carried, health: (await on(host, idB)).health, stun: struggleStun };
await settle();

// 6. B goes down alone, a second from getting up.
const recoverTicks = recoverTicksAll;
await place({ [idB]: { x: HOOK.x + 8 * M, y: HOOK.y + 6 * M, health: 2, recover: recoverTicks - 30 } });
await host.waitForTimeout(2000);
results.recovered = (await everywhere(idB)).map((p) => p.health);
results.pipsRecovered = await pips(b);
await b.screenshot({ path: `${prefix}-B-recovered.png` });
await browser.close();

console.log(JSON.stringify({ ...results, checkAfterMs, carriedTo: (carriedAtHook.x - HOOK.x) / M, killerAt: (killerAtHook.x - HOOK.x) / M }));
console.log(`errors: ${errors.length ? errors.join(" | ") : "none"}`);
const all = (xs, v) => xs.every((x) => x === v);
console.log(JSON.stringify({ hookMiss, hookHit, stunned, moved: { whileStunned: (stuckPos.x - stunStart.x) / M, after: (freedPos.x - stuckPos.x) / M } }));
const checks = {
  "health bar shows 0 squares when downed": results.pipsDowned === 0,
  "a help check comes within half a second": checkAfterMs <= 500,
  "a good help check stands A up injured, on every tab": all(results.helped, 1),
  "health bar shows 1 square when injured": results.pipsInjured === 1,
  "the killer picks A up, on every tab": all(results.carried, true),
  "the killer is told how to pick up": /press E to pick them up|carrying/.test(killerHud),
  "the carried survivor rides with the killer": carriedAtHook.x === killerAtHook.x && carriedAtHook.y === killerAtHook.y,
  "the killer hangs A on the hook, on every tab": all(results.hooked, 3),
  "health bar shows 0 squares on the hook": results.pipsHooked === 0,
  "B is shown where A was hooked": /TEAMMATE HOOKED: .+, \d+ m/.test(alertHuds.B),
  "neither A nor the killer gets the alert": !/TEAMMATE HOOKED/.test(alertHuds.A) && !/TEAMMATE HOOKED/.test(alertHuds.host),
  "the alert is gone after 3 s": !/TEAMMATE HOOKED/.test(alertAfter),
  "A is told the hook time": /on the hook: \d+ s left/.test(hookedHud),
  "B unhooks A injured, on every tab": all(results.rescued, "0/1"),
  "rescue keeps the hook time used": results.hookUsedKept,
  "health bar shows 1 square after a rescue": results.pipsRescued === 1,
  "the hook timer eliminates A, on every tab": all(results.eliminated, true),
  "A is told": results.eliminatedHud,
  "a downed survivor left alone gets up injured, on every tab": all(results.recovered, 1),
  "health bar shows 1 square after getting up alone": results.pipsRecovered === 1,
  "a timed-out hook check costs 5 s of hook time": hookMiss.result === 2 && hookMiss.cost === penalty,
  "a good hook check costs nothing": hookHit.result === 1 && hookHit.cost === 0,
  "the hooked guest sees the same checks and hook time": hookMiss.guestResult === 2 && hookHit.guestResult === 1 && hookHit.agree,
  "the killer picks B up": pickedUp,
  "held too long, B breaks free and stuns the killer": stunned && /STUNNED/.test(killerHudStunned),
  "B is free and injured on every tab": all(results.brokeFree, "false/1"),
  "health bar shows 1 square after breaking free": results.pipsBrokeFree === 1,
  "the carried survivor is told to alternate E and Q": /press E then Q/.test(struggleHud),
  "mashing one key barely helps": results.struggled.mash <= 60,
  "alternating E and Q takes a second off per press": results.struggled.alternated >= 14 * 30,
  "a quick survivor is off the shoulder in seconds, not a minute": !results.struggled.carried && results.struggled.freeAfterMs < 10000,
  "struggling free injures them and stuns the killer for 1.5 s": results.struggled.health === 1 && results.struggled.stun >= 40,
  "a stunned killer cannot move, then can": Math.abs(stuckPos.x - stunStart.x) < 1000 && freedPos.x - stuckPos.x > 1e6,
  "no errors": errors.length === 0,
};
for (const [name, pass] of Object.entries(checks)) console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
