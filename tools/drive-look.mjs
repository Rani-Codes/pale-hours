// Usage: node drive-look.mjs <url> <shot-prefix> [spot ...]
// Art review: a two-tab match in real Chrome, the killer (host) placed at named
// spots (facing north, the default look) through paleSim.load, one
// screenshot per spot. Survivor 2 stands where the spot puts them.
// Prints the frame rate over two seconds; headless Chrome may render on the
// CPU, so treat it as a floor, not what a player gets.
import { chromium } from "playwright-core";
import { startMatch } from "./lib/lobby.mjs";

const [url = "http://localhost:5173/", prefix = "look", ...only] = process.argv.slice(2);
const M = 1e6;
// [killer x, y], [survivor x, y], extra survivor fields
const spots = {
  generator: [[-21, 13.5], [-19.5, 16]],
  hook: [[-16, -3.2], [-16, 0], { health: 2, onHook: 3 }],
  gate: [[1.5, 22.5], [2, 26]],
  survivors: [[10, -3.5], [10, 0]],
  injured: [[10, -2.2], [10, 0], { health: 1 }],
  downed: [[10, -2.2], [10, 0], { health: 2 }],
  lane: [[4, -14], [6, -8]],
  edge: [[14, 25], [16, 27]],
  open: [[-4, -6], [-2, 2]],
};
const browser = await chromium.launch({ channel: "chrome", args: ["--disable-features=WebRtcHideLocalIpsWithMdns"] });
const context = await browser.newContext({ viewport: { width: 960, height: 600 } });
const errors = [];
const open = async () => {
  const p = await context.newPage();
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await p.goto(url);
  await p.waitForFunction(() => globalThis.paleSim);
  return p;
};
// A match needs two players: the host is the killer and takes the shots, a guest is survivor 2.
const page = await open();
await page.click("#host");
await page.waitForFunction(() => /room [A-Z0-9]{4}/.test(document.querySelector("#netstatus").textContent));
const guest = await open();
await guest.fill("#code", (await page.textContent("#netstatus")).match(/room ([A-Z0-9]{4})/)[1]);
await guest.click("#join");
await startMatch(page, [guest]);

for (const [name, [k, s, extra = {}]] of Object.entries(spots)) {
  if (only.length && !only.includes(name)) continue;
  await page.evaluate(
    ({ k, s, extra }) => {
      const st = paleSim.state();
      for (const p of st.players) {
        delete p.trail;
        Object.assign(p, p.id === 1 ? { x: k[0] * 1e6, y: k[1] * 1e6, yaw: 0 } : { x: s[0] * 1e6, y: s[1] * 1e6, yaw: 32768, health: 0, onHook: 0, carried: false, ...extra });
      }
      paleSim.load(st);
    },
    { k, s, extra },
  );
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${prefix}-${name}.png` });
}
const fps = await page.evaluate(
  () =>
    new Promise((done) => {
      let n = 0;
      const start = performance.now();
      const tick = () => (performance.now() - start < 2000 ? (n++, requestAnimationFrame(tick)) : done(n / 2));
      requestAnimationFrame(tick);
    }),
);
await browser.close();
console.log(`fps ${fps.toFixed(0)}`);
console.log(`errors: ${errors.length ? errors.join(" | ") : "none"}`);
process.exit(errors.length ? 1 : 0);
