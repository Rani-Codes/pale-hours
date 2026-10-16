// Usage: node drive-endgame.mjs <url> <shot-prefix> [query]
// The killer hosts; survivors A and B join. Setup through paleSim.load on
// the host powers and opens a gate, hangs B with a few seconds of hook time
// left, and places players. Everything else is real keys and clicks.
//   1. B's heartbeat beats with the killer beside them, and stops once hooked.
//   2. A walks out of the open gate and spectates: Space switches who.
//   3. B dies on the hook: the match is over on every tab, each tab's end
//      screen speaks to its player, and the match is frozen.
//   4. The host clicks Rematch: a fresh match on every tab.
import { chromium } from "playwright-core";
import { startMatch } from "./lib/lobby.mjs";

const [url = "http://localhost:5173/", prefix = "endgame", query = ""] = process.argv.slice(2);
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
const place = (changes, world = {}) =>
  host.evaluate(
    ({ changes, world }) => {
      const s = paleSim.state();
      for (const p of s.players) {
        const c = changes[p.id];
        if (!c) continue;
        if (c.x !== undefined) delete p.trail;
        Object.assign(p, c);
      }
      paleSim.load({ ...s, ...world });
    },
    { changes, world },
  );
const on = (page, id) => page.evaluate((id) => paleSim.state().players.find((p) => p.id === id), id);
const bpm = (page) => page.evaluate(() => paleHeartbeat.current.bpm);
const over = (page) => page.evaluate(() => !!paleSim.state().over);
const headline = (page) => page.textContent("#result-headline");
const shown = (page) => page.evaluate(() => getComputedStyle(document.querySelector("#result")).display !== "none");
const settle = (ms = 900) => host.waitForTimeout(ms);
const { hookTicks, hook, gateTicks, gensRequired, genTicks } = await host.evaluate(() => ({
  hookTicks: paleSim.hookTicks,
  hook: paleSim.hookSites[2],
  gateTicks: paleSim.gateTicks,
  gensRequired: paleSim.gensRequired,
  genTicks: paleSim.genTicks,
}));

// 1. Heartbeat beside the killer, then on the hook.
await place({ 1: { x: hook.x + 1 * M, y: hook.y }, [idA]: { x: 1.5 * M, y: 24.5 * M }, [idB]: { x: hook.x + 1 * M, y: hook.y + 1.2 * M } });
await settle();
const beatNear = await bpm(b);
await place({ [idB]: { x: hook.x, y: hook.y, health: 2, onHook: 3, hookUsed: hookTicks - 150 } });
await settle();
const beatHooked = await bpm(b);
const hookedHud = await b.textContent("#hud");

// 2. A walks out of the open north gate, then spectates.
const s0 = await host.evaluate(() => paleSim.state());
await place({}, { gens: s0.gens.map((g, i) => (i < gensRequired ? genTicks : g)), gates: s0.gates.map((g, i) => (i === 0 ? gateTicks : g)) });
await settle(500);
await a.keyboard.down("KeyW");
const escaped = await a.waitForFunction(() => paleSession.stats().predicted?.escaped, null, { timeout: 3000, polling: 10 }).then(() => true, () => false);
await a.keyboard.up("KeyW");
await settle();
const watchFirst = await a.evaluate(() => paleSpectate.id);
const aHud = await a.textContent("#hud");
await a.screenshot({ path: `${prefix}-A-spectating.png` });
await a.keyboard.press("Space");
await a.waitForTimeout(200);
const watchNext = await a.evaluate(() => paleSpectate.id);
const beatOut = await bpm(a);

// 3. B dies on the hook; the match ends.
const ended = await host.waitForFunction(() => paleSim.state().over, null, { timeout: 8000, polling: 20 }).then(() => true, () => false);
if (!ended) {
  const s = await host.evaluate(() => paleSim.state());
  console.log("NOT OVER", JSON.stringify({ tick: s.tick, gates: s.gates, players: s.players.map(({ trail, ...p }) => p) }));
}
await settle();
const overAll = [await over(host), await over(a), await over(b)];
const screens = { host: await headline(host), A: await headline(a), B: await headline(b) };
const shownAll = [await shown(host), await shown(a), await shown(b)];
const rematchShown = { host: await host.isVisible("#rematch"), A: await a.isVisible("#rematch") };
await host.screenshot({ path: `${prefix}-host-over.png` });
await a.screenshot({ path: `${prefix}-A-over.png` });
await b.screenshot({ path: `${prefix}-B-over.png` });
const frozenFrom = await on(host, 1);
await host.keyboard.down("KeyW");
await host.waitForTimeout(500);
await host.keyboard.up("KeyW");
const frozenTo = await on(host, 1);

// 4. Rematch.
if (ended) await host.click("#rematch");
await settle(1200);
const fresh = await Promise.all([host, a, b].map((page) => page.evaluate(() => paleSim.state())));
const freshShown = [await shown(host), await shown(a), await shown(b)];
await host.screenshot({ path: `${prefix}-host-rematch.png` });
await browser.close();

const inPlay = (s) => !s.over && s.players.length === 3 && s.players.every((p) => !p.escaped && !p.eliminated && p.health === 0) && s.gens.every((g) => g === 0) && s.gates.every((g) => g === 0);
const killerAt = fresh[0].players.find((p) => p.id === 1);
console.log(JSON.stringify({ beatNear, beatHooked, beatOut, escaped, watchFirst, watchNext, screens, overAll, shownAll, rematchShown, frozenMoved: (frozenTo.y - frozenFrom.y) / M, killerRespawn: [killerAt.x / M, killerAt.y / M] }));
console.log(`errors: ${errors.length ? errors.join(" | ") : "none"}`);
const checks = {
  "the heartbeat plays with the killer beside a free survivor": beatNear > 0,
  "the heartbeat stops on the hook, killer beside them": beatHooked === 0,
  "the hooked survivor is told to hit skill checks": /press Space on each skill check/.test(hookedHud),
  "A walks out of the open gate": escaped,
  "A spectates a survivor still in play first": watchFirst === idB,
  "Space switches to the killer": watchNext === 1,
  "the spectating tab says so, with no heartbeat": /spectating/.test(aHud) && beatOut === 0,
  "the last hook death ends the match on every tab": ended && overAll.every(Boolean),
  "every tab shows the end screen": shownAll.every(Boolean),
  "each end screen speaks to its player": screens.host === "You killed 1 of 2" && screens.A === "You escaped" && screens.B === "You died",
  "only the host gets Rematch": rematchShown.host && !rematchShown.A,
  "a finished match is frozen": frozenTo.y === frozenFrom.y,
  "Rematch starts a fresh match on every tab": fresh.every(inPlay) && freshShown.every((v) => !v),
  "the killer is back at his spawn": killerAt.x === -10 * M && killerAt.y === 0,
  "no errors": errors.length === 0,
};
for (const [name, pass] of Object.entries(checks)) console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
