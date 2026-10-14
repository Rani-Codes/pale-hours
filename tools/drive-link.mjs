// Usage: node drive-link.mjs <url> <shot-prefix>
// Opens two tabs in real Chrome, hosts in one, joins from the other, and checks
// that both data channels (reliable and unreliable) carry a ping round trip.
import { chromium } from "playwright-core";

const [url = "http://localhost:5173/", prefix = "link"] = process.argv.slice(2);
// Automated Chrome does not resolve mDNS host candidates between tabs, so ICE stalls; send raw LAN IPs instead.
const browser = await chromium.launch({ channel: "chrome", args: ["--disable-features=WebRtcHideLocalIpsWithMdns"] });
const context = await browser.newContext({ viewport: { width: 900, height: 600 } });
const errors = [];
const open = async (name) => {
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`${name}: ${m.text()}`));
  await page.goto(url);
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

const rttSeen = () => /rtt reliable [\d.]+ ms\s+unreliable [\d.]+ ms/.test(document.querySelector("#netstatus").textContent);
let ok = true;
try {
  await host.waitForFunction(rttSeen, null, { timeout: 15000 });
  await guest.waitForFunction(rttSeen, null, { timeout: 15000 });
} catch {
  ok = false;
}
console.log(`room ${code}`);
console.log(`host : ${(await host.textContent("#netstatus")).replace(/\n/g, " | ")}`);
console.log(`guest: ${(await guest.textContent("#netstatus")).replace(/\n/g, " | ")}`);
await host.screenshot({ path: `${prefix}-host.png` });
await guest.screenshot({ path: `${prefix}-guest.png` });
await browser.close();
console.log(`errors: ${errors.length ? errors.join(" | ") : "none"}`);
process.exit(ok && errors.length === 0 ? 0 : 1);
