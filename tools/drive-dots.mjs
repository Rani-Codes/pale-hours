// Usage: node drive-dots.mjs <url> <screenshot.png>
// Holds keys on the dots page in real Chrome and checks where the sim moved each player.
import { chromium } from "playwright-core";

const [url = "http://localhost:5173/", shot = "dots.png"] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("response", (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));

await page.goto(url);
await page.waitForFunction(() => globalThis.paleSim?.state().tick > 30);
const start = await page.evaluate(() => paleSim.state());

await page.keyboard.down("KeyD");
await page.keyboard.down("ArrowUp");
await page.waitForTimeout(1000);
await page.keyboard.up("KeyD");
await page.keyboard.up("ArrowUp");
const end = await page.evaluate(() => paleSim.state());
await page.screenshot({ path: shot });
await browser.close();

// Keys go down and up between ticks, so allow up to two ticks of slack.
const ticks = end.tick - start.tick;
const within = (moved, perTick) => moved <= ticks * perTick && moved >= (ticks - 2) * perTick;
const [k0, s0] = start.players;
const [k1, s1] = end.players;
const killerDx = k1.x - k0.x;
const survivorDy = s1.y - s0.y;
console.log(`ticks ${start.tick} -> ${end.tick} (${ticks})`);
console.log(`killer moved east ${killerDx / 1e6} m, north ${(k1.y - k0.y) / 1e6} m`);
console.log(`survivor moved north ${survivorDy / 1e6} m, east ${(s1.x - s0.x) / 1e6} m`);
console.log(`errors: ${errors.length ? errors.join(" | ") : "none"}`);

const ok =
  errors.length === 0 &&
  ticks >= 25 &&
  within(killerDx, 153333) && k1.y === k0.y &&
  within(survivorDy, 133333) && s1.x === s0.x;
console.log(ok ? "PASS" : "FAIL");
process.exit(ok ? 0 : 1);
