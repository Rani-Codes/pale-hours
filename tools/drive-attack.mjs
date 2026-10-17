// Usage: node drive-attack.mjs <url> <shot-prefix> [query]
// Host (killer) and guest (survivor) in real Chrome. Setup places the two a
// step apart in open ground through paleSim.load on the host; every swing is
// a real left click and every step a real key.
//   1. Two swings at a survivor standing still: injured, then downed. Both
//      tabs agree and the guest shows each hit.
//   2. The downed survivor crawls, slowly.
//   3. The survivor strafes back and forth across the edge of the killer's
//      cone while the killer swings. Each swing must land exactly when the
//      survivor was in reach on the frame the killer last saw, which is what
//      lag compensation promises. Swings where the survivor's position on the
//      landing tick would have given the other answer are counted.
import { chromium } from "playwright-core";
import { startMatch } from "./lib/lobby.mjs";

const [url = "http://localhost:5173/", prefix = "attack", query = ""] = process.argv.slice(2);
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
await host.waitForFunction(() => paleSim.state().tick > 30);

const M = 1e6;
const KILLER = { x: -4 * M, y: -3 * M };
const ROW = KILLER.y + 1.6 * M; // the survivor's lane, 1.6 m in front of the killer

// Setup only: move players and set health. Moved players drop their trail so it refills at the new spot.
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
const hostSurvivor = () => host.evaluate(() => paleSim.state().players.find((p) => p.id === 2));
const guestSelf = () => guest.evaluate(() => paleSession.stats().predicted);
const swings = () => host.evaluate(() => paleSession.swings.slice());
const click = () => host.mouse.click(450, 300);
const settle = () => host.waitForTimeout(1300); // whiff recovery plus windup, and time for snapshots to land

// 1. Two hits on a survivor standing still.
await place({ 1: { x: KILLER.x, y: KILLER.y, yaw: 0 }, 2: { x: KILLER.x, y: ROW, health: 0, boost: 0, invuln: 0 } });
await guest.waitForFunction((row) => Math.abs(paleSession.stats().predicted.y - row) < 1000, ROW, { timeout: 5000 });
await click();
await settle();
const afterOne = { host: (await hostSurvivor()).health, guest: (await guestSelf()).health };
const invulnAfterOne = (await hostSurvivor()).invuln;
await place({ 2: { x: KILLER.x, y: ROW, boost: 0 } }); // the boost ran them off; put them back, still invincible
await guest.waitForTimeout(400);
await click();
await settle();
const whileInvincible = (await hostSurvivor()).health;
await place({ 2: { x: KILLER.x, y: ROW, boost: 0, invuln: 0 } }); // now let the two seconds pass
await guest.waitForTimeout(400);
await click();
await settle();
const afterTwo = { host: (await hostSurvivor()).health, guest: (await guestSelf()).health };
const flashesAfterTwo = await guest.evaluate(() => paleHitsSeen.hits);
await guest.screenshot({ path: `${prefix}-guest-downed.png` });
await host.screenshot({ path: `${prefix}-host-downed.png` });

// A downed survivor takes no further hit.
await click();
await settle();
const downedHit = (await hostSurvivor()).health;

// 2. Crawl north for a second.
const crawlFrom = await hostSurvivor();
await guest.keyboard.down("KeyW");
await guest.waitForTimeout(1000);
await guest.keyboard.up("KeyW");
await guest.waitForTimeout(1200);
const crawlTo = await hostSurvivor();
const crawlGuest = await guestSelf();
const crawled = (crawlTo.y - crawlFrom.y) / M;

// 3. Sweep across the cone edge while the killer swings.
const swingsBefore = (await swings()).length;
await place({ 1: { x: KILLER.x, y: KILLER.y, yaw: 0 }, 2: { x: KILLER.x - 3.2 * M, y: ROW, health: 0, boost: 0, invuln: 0 } });
await guest.waitForTimeout(600);
const SWEEP = 3.2 * M; // the survivor turns around this far either side of the killer
const SWINGS = 24;
let sweeping = true;
const sweep = (async () => {
  let key = "KeyD";
  await guest.keyboard.down(key);
  while (sweeping) {
    const dx = (await guestSelf()).x - KILLER.x;
    const want = dx > SWEEP ? "KeyA" : dx < -SWEEP ? "KeyD" : key;
    if (want !== key) {
      await guest.keyboard.up(key);
      await guest.keyboard.down((key = want));
    }
    await guest.waitForTimeout(30);
  }
  await guest.keyboard.up(key);
})();

// Where the survivor's body leaves the cone along their lane, found with the sim's own test.
const edge = await host.evaluate(
  ({ k, row }) => {
    let dx = 0;
    while (paleSim.inReach(k.x, k.y, 0, k.x + dx, row)) dx += 10_000;
    return dx;
  },
  { k: KILLER, row: ROW },
);
// Every other swing is aimed so it lands while the survivor crosses the edge:
// wait until, at the landing tick (about seven ticks after the click), the
// survivor will be a fraction of a tick past it.
const aim = () =>
  host.waitForFunction(
    ({ k, edge }) => {
      const s = paleSim.state();
      const p = s.players.find((q) => q.id === 2);
      const g = (globalThis.aimTrack ??= { tick: -1, x: p.x, dir: 0 });
      if (s.tick !== g.tick) {
        if (p.x !== g.x) g.dir = Math.sign(p.x - g.x);
        g.tick = s.tick;
        g.x = p.x;
      }
      if (!g.dir) return false;
      const step = (4e6 / paleSim.tickRate) * g.dir;
      const landing = p.x - k.x + 7 * step;
      return [-edge, edge].some((e) => {
        const past = (landing - e) / step; // ticks past the edge at landing, in the direction of travel
        return past > 0.3 && past < 1.1;
      });
    },
    { k: KILLER, edge },
    { polling: "raf", timeout: 6000 },
  );
let guestHits = flashesAfterTwo;
for (let i = 0; i < SWINGS; i++) {
  const before = (await swings()).length;
  if (i % 2) await aim().catch(() => {});
  await click();
  await host.waitForFunction((n) => paleSession.swings.length > n, before, { timeout: 3000 });
  const last = (await swings()).at(-1);
  // Give the hit time to reach the guest before healing them for the next swing.
  await host.waitForTimeout(500);
  if (last.hit) {
    guestHits++;
    await place({ 2: { health: 0, boost: 0, invuln: 0 } });
  }
  // The next click only counts once the recovery is over (1.2 to 1.4 s).
  await host.waitForFunction((id) => paleSim.state().players.find((p) => p.id === id).swing === 0, 1, { timeout: 4000, polling: 20 });
  await host.waitForTimeout((i * 137) % 400); // vary the phase against the sweep
}
sweeping = false;
await sweep;
await host.waitForTimeout(1500);

const sweepLog = (await swings()).slice(swingsBefore);
const judged = await host.evaluate((log) =>
  log.map((s) => {
    const drawn = s.drawn.find((p) => p.id === 2);
    const now = s.now.find((p) => p.id === 2);
    return {
      hit: s.hit,
      lag: s.viewLagMs,
      sawInReach: !!drawn && paleSim.inReach(s.killer.x, s.killer.y, s.killer.yaw, Math.round(drawn.x), Math.round(drawn.y)),
      nowInReach: !!now && paleSim.inReach(s.killer.x, s.killer.y, s.killer.yaw, now.x, now.y),
      drawnX: drawn && (drawn.x - s.killer.x) / 1e6,
      nowX: now && (now.x - s.killer.x) / 1e6,
    };
  }),
  sweepLog,
);
const flashes = await guest.evaluate(() => paleHitsSeen.hits);
const endHost = await hostSurvivor();
const endGuest = await guestSelf();
await host.screenshot({ path: `${prefix}-host.png` });
await guest.screenshot({ path: `${prefix}-guest.png` });
await browser.close();

const agreeSeen = judged.filter((j) => j.hit === j.sawInReach).length;
const rewindMattered = judged.filter((j) => j.sawInReach !== j.nowInReach).length;
const hits = judged.filter((j) => j.hit).length;
const lags = judged.map((j) => j.lag);
console.log(`stationary: after one swing host ${afterOne.host} guest ${afterOne.guest}; after two host ${afterTwo.host} guest ${afterTwo.guest}; swing at downed leaves ${downedHit}`);
console.log(`crawl: ${crawled.toFixed(2)} m in 1 s on the host, guest at y ${(crawlGuest.y / M).toFixed(3)} host ${(crawlTo.y / M).toFixed(3)}`);
console.log(`cone edge along the lane: ${(edge / M).toFixed(2)} m either side`);
console.log(`sweep: ${judged.length} swings, ${hits} hits; ${agreeSeen}/${judged.length} match what the killer saw; ${rewindMattered} would have gone the other way judged on the landing tick; view lag ${Math.min(...lags)}-${Math.max(...lags)} ms`);
for (const j of judged) console.log(`  ${j.hit ? "HIT " : "miss"} lag ${String(j.lag).padStart(3)} ms  drawn dx ${j.drawnX?.toFixed(3)} m  landing dx ${j.nowX?.toFixed(3)} m${j.sawInReach !== j.nowInReach ? "  <- rewind decided" : ""}`);
console.log(`guest flashes ${flashes}, host hits on the guest ${guestHits}; end health host ${endHost.health} guest ${endGuest.health}`);
console.log(`errors: ${errors.length ? errors.join(" | ") : "none"}`);
const checks = {
  "first hit injures, on both tabs": afterOne.host === 1 && afterOne.guest === 1,
  "a freshly hit survivor is invincible for a while": invulnAfterOne > 0 && whileInvincible === 1,
  "second hit downs, on both tabs": afterTwo.host === 2 && afterTwo.guest === 2,
  "a downed survivor takes no hit": downedHit === 2,
  "downed crawls slowly (0.5-0.9 m/s)": crawled > 0.5 && crawled < 0.9,
  "crawl agrees on both tabs": Math.abs(crawlGuest.y - crawlTo.y) < 1000,
  "the sweep both hit and missed": hits > 0 && hits < judged.length,
  "every swing matched what the killer saw": judged.length >= SWINGS - 1 && agreeSeen === judged.length,
  "rewind decided at least one swing at the cone edge": rewindMattered > 0,
  "the guest saw every hit": flashes === guestHits,
  "both tabs agree on health at the end": endHost.health === endGuest.health,
  "no errors": errors.length === 0,
};
for (const [name, pass] of Object.entries(checks)) console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
