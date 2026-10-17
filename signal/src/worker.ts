// HTTP API: POST to send, a WebSocket per peer to receive. Each room lives in
// its own Durable Object, so one instance holds all of a room's peers.
import { DurableObject } from "cloudflare:workers";
import { config } from "./config.ts";
import { Room, randomString, type Socket } from "./room.ts";

interface Env {
  ROOMS: DurableObjectNamespace<RoomObject>;
}

export class RoomObject extends DurableObject<Env> {
  private room?: Room;

  /** Starts a room unless this code is taken. Returns the host's peer id. */
  open(): string | undefined {
    if (this.room) return undefined;
    this.room = new Room({
      ...config,
      after: (ms, f) => setTimeout(f, ms),
      onClose: () => (this.room = undefined),
    });
    return this.room.host;
  }

  join(): string | "no-room" | "room-full" {
    return this.room ? this.room.join() : "no-room";
  }

  relay(from: string, to: string, data: unknown): boolean {
    return this.room?.relay(from, to, data) ?? false;
  }

  /** One peer's event socket. Messages go out on it; sends come in over POST. */
  async fetch(req: Request): Promise<Response> {
    const room = this.room;
    const id = new URL(req.url).pathname.split("/")[4];
    if (req.headers.get("Upgrade") !== "websocket") return text("expected a websocket", 426);
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    const send = (s: string) => {
      try {
        server.send(s);
      } catch {}
    };
    const beat = setInterval(() => send(`{"type":"beat"}`), config.heartbeatMs);
    const socket: Socket = {
      send: (m) => send(JSON.stringify(m)),
      close() {
        clearInterval(beat);
        try {
          server.close(1000, "room closed");
        } catch {}
      },
    };
    if (!room?.attach(id, socket)) {
      socket.close();
      return text(room ? "no such peer" : "no such room", 404);
    }
    const ended = () => {
      clearInterval(beat);
      room.detach(id, socket);
    };
    server.addEventListener("close", ended);
    server.addEventListener("error", ended);
    return new Response(null, { status: 101, webSocket: client });
  }
}

const json = (v: unknown) => Response.json(v);
const text = (s: string, status: number) => new Response(s + "\n", { status });

const codeRe = `[A-Z0-9]{${config.codeLength}}`;
const routes = {
  create: new RegExp(`^/rooms$`),
  join: new RegExp(`^/rooms/(${codeRe})/join$`),
  events: new RegExp(`^/rooms/(${codeRe})/peers/(\\w+)/events$`),
  signal: new RegExp(`^/rooms/(${codeRe})/peers/(\\w+)/signal$`),
};

async function route(req: Request, env: Env): Promise<Response> {
  const path = new URL(req.url).pathname;
  const room = (code: string) => env.ROOMS.get(env.ROOMS.idFromName(code));
  let m: RegExpMatchArray | null;

  if (req.method === "POST" && routes.create.test(path)) {
    for (let tries = 0; tries < 20; tries++) {
      const code = randomString(config.codeLength);
      const peer = await room(code).open();
      if (peer) return json({ code, peer });
    }
    return text("no free room code", 503);
  }
  if (req.method === "POST" && (m = path.match(routes.join))) {
    const peer = await room(m[1]).join();
    if (peer === "no-room") return text("no such room", 404);
    if (peer === "room-full") return text("room is full", 409);
    return json({ peer });
  }
  if (req.method === "GET" && (m = path.match(routes.events))) {
    return room(m[1]).fetch(req);
  }
  if (req.method === "POST" && (m = path.match(routes.signal))) {
    const raw = await req.text();
    let body: { to?: unknown; data?: unknown } | undefined;
    try {
      body = raw.length <= config.maxSignalBytes ? JSON.parse(raw) : undefined;
    } catch {}
    if (typeof body?.to !== "string" || body.to === "") return text("bad request", 400);
    if (!(await room(m[1]).relay(m[2], body.to, body.data))) return text("no such peer", 404);
    return new Response(null, { status: 204 });
  }
  return text("not found", 404);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const res = req.method === "OPTIONS" ? new Response(null, { status: 204 }) : await route(req, env);
    if (res.webSocket) return res;
    const out = new Response(res.body, res);
    out.headers.set("Access-Control-Allow-Origin", "*");
    out.headers.set("Access-Control-Allow-Headers", "Content-Type");
    out.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    return out;
  },
} satisfies ExportedHandler<Env>;
