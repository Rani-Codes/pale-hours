// Runs the real Worker under `wrangler dev` and talks to it over HTTP.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createServer } from "node:net";

let base = "";
let dev: ChildProcess;

const freePort = () =>
  new Promise<number>((resolve) => {
    const s = createServer().listen(0, () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolve(port));
    });
  });

before(async () => {
  mkdirSync(new URL("../../client/dist", import.meta.url), { recursive: true });
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  dev = spawn("node_modules/.bin/wrangler", ["dev", "--ip", "127.0.0.1", "--port", String(port)], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
    stdio: "ignore",
  });
  for (let i = 0; i < 120; i++) {
    if (await fetch(base + "/nope").then((r) => r.status === 404, () => false)) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("wrangler dev did not start");
});

after(() => {
  dev.kill();
});

const post = (path: string, body?: unknown) =>
  fetch(base + path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

async function events(code: string, peer: string) {
  const ws = new WebSocket(`${base.replace("http", "ws")}/rooms/${code}/peers/${peer}/events`);
  const queue: Record<string, unknown>[] = [];
  let wake = () => {};
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.type !== "beat") queue.push(m);
    wake();
  };
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  return {
    async next(): Promise<Record<string, unknown>> {
      while (!queue.length) await new Promise<void>((r) => (wake = r));
      return queue.shift()!;
    },
    close: () => ws.close(),
  };
}

test("relays between peers and reports a closed socket", async () => {
  const { code, peer: host } = await (await post("/rooms")).json();
  assert.match(code, /^[A-Z0-9]{4}$/);
  const hostEvents = await events(code, host);

  const joined = await post(`/rooms/${code}/join`);
  assert.equal(joined.status, 200);
  assert.equal(joined.headers.get("access-control-allow-origin"), "*");
  const { peer: guest } = await joined.json();
  assert.deepEqual(await hostEvents.next(), { type: "peer-joined", from: guest });

  const guestEvents = await events(code, guest);
  assert.deepEqual(await guestEvents.next(), { type: "welcome", host });

  const sent = await post(`/rooms/${code}/peers/${guest}/signal`, { to: host, data: { candidate: "c1" } });
  assert.equal(sent.status, 204);
  assert.deepEqual(await hostEvents.next(), { type: "signal", from: guest, data: { candidate: "c1" } });

  guestEvents.close();
  assert.deepEqual(await hostEvents.next(), { type: "peer-left", from: guest });

  const late = await (await post(`/rooms/${code}/join`)).json();
  assert.deepEqual(await hostEvents.next(), { type: "peer-joined", from: late.peer });
  const lateEvents = await events(code, late.peer);
  assert.deepEqual(await lateEvents.next(), { type: "welcome", host });
  hostEvents.close();
  assert.deepEqual(await lateEvents.next(), { type: "room-closed" });
  assert.equal((await post(`/rooms/${code}/join`)).status, 404);
});

test("status codes", async () => {
  assert.equal((await post("/rooms/ZZZZ/join")).status, 404);
  assert.equal((await fetch(base + "/rooms", { method: "OPTIONS" })).status, 204);
  const { code, peer } = await (await post("/rooms")).json();
  assert.equal((await post(`/rooms/${code}/peers/${peer}/signal`, { data: 1 })).status, 400);
  assert.equal((await post(`/rooms/${code}/peers/${peer}/signal`, { to: "ghost", data: 1 })).status, 404);
  await assert.rejects(events(code, "ghost"));
  for (let i = 0; i < 4; i++) assert.equal((await post(`/rooms/${code}/join`)).status, 200);
  assert.equal((await post(`/rooms/${code}/join`)).status, 409);
});
