// Usage: [PALE_APP_PORT=5173] [PALE_SIGNAL_PORT=8787] [PALE_EVIDENCE_DIR=dir] node latency-matrix.mjs [runs per profile, default 3]
// Runs drive-netplay.mjs under every network profile and prints one table.
// Reuses the signaling and dev servers if they are already up on those ports,
// otherwise starts them and stops them when done. Exits nonzero if any run failed.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const runs = Number(process.argv[2] ?? 3);
const appPort = process.env.PALE_APP_PORT ?? "5173";
const signalPort = process.env.PALE_SIGNAL_PORT ?? "8787";
const appBase = `http://localhost:${appPort}/`;
const signalUrl = `http://localhost:${signalPort}`;
const appUrl = `${appBase}?signal=${signalUrl}`;

// Delay is added on each tab's sends, so round trip is twice the delay.
const profiles = [
  { name: "clean", query: "" },
  { name: "100ms RTT, 5% loss", query: "delay=50&loss=0.05" },
  { name: "200ms RTT, 5% loss", query: "delay=100&loss=0.05" },
  { name: "200ms RTT, 40ms jitter, 5% loss", query: "delay=100&jitter=40&loss=0.05" },
  { name: "400ms RTT, 5% loss (stress)", query: "delay=200&loss=0.05" },
];

const up = (url) => fetch(url).then(() => true, () => false);
const started = [];
async function ensure(name, url, cmd, args, cwd) {
  if (await up(url)) return console.log(`${name}: reusing ${url}`);
  const child = spawn(cmd, args, { cwd, stdio: "ignore", detached: true });
  started.push(child);
  for (let i = 0; i < 120 && !(await up(url)); i++) await new Promise((r) => setTimeout(r, 500));
  if (!(await up(url))) throw new Error(`${name} did not come up at ${url}`);
  console.log(`${name}: started at ${url}`);
}
const stopAll = () => started.forEach((c) => process.kill(-c.pid));
process.on("SIGINT", () => (stopAll(), process.exit(130)));

function drive(query, shots) {
  return new Promise((resolve) => {
    const child = spawn("node", [join(root, "tools/drive-netplay.mjs"), appUrl, shots, query], { cwd: join(root, "tools") });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => {
      const m = out.match(/^METRICS (.*)$/m);
      resolve({ ok: code === 0, metrics: m ? JSON.parse(m[1]) : { failed: ["driver crashed"] }, out });
    });
  });
}

const range = (xs) => (xs.length ? `${Math.min(...xs)}-${Math.max(...xs)}` : "n/a");
let allOk = true;
try {
  await ensure("signal", signalUrl, "go", ["run", ".", "-addr", `localhost:${signalPort}`], join(root, "signal"));
  await ensure("client", appBase, "npm", ["run", "dev", "--", "--port", appPort, "--strictPort"], join(root, "client"));
  const shotDir = process.env.PALE_EVIDENCE_DIR ?? mkdtempSync(join(tmpdir(), "pale-latency-"));
  mkdirSync(shotDir, { recursive: true });
  console.log(`screenshots: ${shotDir}\n`);
  console.log("profile                              pass  join ms    killer shown ms  corrections  starved frames  dropped inputs");
  for (const p of profiles) {
    const rs = [];
    for (let i = 0; i < runs; i++) rs.push(await drive(p.query, join(shotDir, `${p.query || "clean"}-${i}`)));
    const ms = rs.map((r) => r.metrics);
    const pick = (k) => ms.map((m) => m[k]).filter((v) => v !== undefined);
    const passed = rs.filter((r) => r.ok).length;
    allOk &&= passed === runs;
    console.log(
      `${p.name.padEnd(37)}${`${passed}/${runs}`.padEnd(6)}${range(pick("joinMs")).padEnd(11)}${range(pick("killerShownMs")).padEnd(17)}` +
        `${range(pick("corrections")).padEnd(13)}${range(pick("starved")).padEnd(16)}${range(pick("dropped"))}`,
    );
    for (const r of rs.filter((r) => !r.ok)) console.log(`  failed: ${r.metrics.failed.join("; ")}\n${r.out.replace(/^/gm, "    ")}`);
  }
} finally {
  stopAll();
}
console.log(allOk ? "\nPASS" : "\nFAIL");
process.exit(allOk ? 0 : 1);
