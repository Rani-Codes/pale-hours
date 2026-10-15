// Usage: node drive-heartbeat.mjs <url> <shot-prefix> [query]
// Host (killer) and guest (survivor) in real Chrome. The survivor's heartbeat
// must be audible at spawn range, speed up and get louder as the killer walks
// toward it, and the killer must hear nothing.
import { chromium } from "playwright-core";

const [url = "http://localhost:5173/", prefix = "heartbeat", query = ""] = process.argv.slice(2);
const withQuery = (u) => (query ? u + (u.includes("?") ? "&" : "?") + query : u);
const browser = await chromium.launch({
  channel: "chrome",
  args: ["--disable-features=WebRtcHideLocalIpsWithMdns", "--autoplay-policy=no-user-gesture-required"],
});
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
await guest.click("#join"); // a real click, which also unlocks audio
const linked = () => /rtt reliable/.test(document.querySelector("#netstatus").textContent);
await host.waitForFunction(linked, null, { timeout: 15000 });
await guest.waitForFunction(linked, null, { timeout: 15000 });
await guest.waitForFunction(() => globalThis.paleHeartbeat.current.bpm > 0, null, { timeout: 5000 });

const beat = (page) => page.evaluate(() => ({ ...paleHeartbeat.current, running: paleHeartbeat.running }));
const far = await beat(guest);
const level = () => guest.evaluate(() => ({ level: paleHeartbeat.level, slider: Number(document.querySelector("#volume").value) }));
const v0 = await level();
await guest.keyboard.press("BracketLeft");
await guest.keyboard.press("BracketLeft");
const v1 = await level();
await guest.keyboard.press("BracketRight");
const v2 = await level();
await guest.fill("#volume", "0");
const muted = await level();
await guest.fill("#volume", String(Math.round(v0.slider)));
await guest.screenshot({ path: `${prefix}-far.png` });

await host.bringToFront();
await host.keyboard.down("KeyD");
await host.waitForTimeout(3000); // 4.6 m/s: about 14 m closer
await host.keyboard.up("KeyD");
await host.waitForTimeout(500);
const near = await beat(guest);
const killer = await beat(host);
await guest.screenshot({ path: `${prefix}-near.png` });
await browser.close();

console.log(`volume: start ${JSON.stringify(v0)}, [ [ ${JSON.stringify(v1)}, ] ${JSON.stringify(v2)}, slider 0 ${JSON.stringify(muted)}`);
console.log(`far : ${JSON.stringify(far)}`);
console.log(`near: ${JSON.stringify(near)}`);
console.log(`killer: ${JSON.stringify(killer)}`);
console.log(`errors: ${errors.length ? errors.join(" | ") : "none"}`);
const checks = {
  "audio context is running": far.running,
  "heartbeat audible at spawn range": far.bpm > 0 && far.gain > 0,
  "faster when the killer is close": near.bpm > far.bpm + 20,
  "louder when the killer is close": near.gain > far.gain,
  "killer hears nothing": killer.bpm === 0,
  "[ lowers the volume 10% each press": Math.abs(v1.slider - (v0.slider - 20)) < 0.01 && Math.abs(v1.level - v1.slider / 100) < 0.01,
  "] raises it": v2.slider === v1.slider + 10,
  "slider to 0 mutes": muted.level === 0,
  "no errors": errors.length === 0,
};
for (const [name, pass] of Object.entries(checks)) console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
