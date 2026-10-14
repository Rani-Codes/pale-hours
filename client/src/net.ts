import { lagSim, net } from "./config";

/** JSON messages over one data channel. Incoming messages are untrusted; parse them. */
export interface Channel {
  send(msg: unknown): void;
  onMessage(fn: (msg: unknown) => void): void;
}

// Two channels per link. "events" is reliable and ordered (lobby, one-off
// events). "state" is unreliable and unordered (inputs, snapshots).
export interface Link {
  peerId: string;
  events: Channel;
  state: Channel;
  onClose(fn: () => void): void;
  close(): void;
}

export interface Room {
  code: string;
  close(): void;
}

interface Handlers {
  /** Both channels are open. */
  onLink(link: Link): void;
  onClosed(reason: string): void;
}

interface SignalMessage {
  type: "welcome" | "peer-joined" | "peer-left" | "signal" | "room-closed";
  from?: string;
  host?: string;
  data?: { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
}

const rtcConfig: RTCConfiguration = { iceServers: [{ urls: net.stunServers }] };

async function api(path: string, body?: unknown): Promise<Response> {
  const res = await fetch(net.signalUrl + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${(await res.text()).trim()}`);
  return res;
}

/** Create a room and offer a connection to every peer that joins. */
export async function hostRoom(handlers: Handlers): Promise<Room> {
  const { code, peer: self } = await (await api("/rooms")).json();
  const conns = new Map<string, Connection>();
  const stream = openStream(code, self, (m) => {
    if (m.type === "peer-joined" && m.from) {
      const conn = new Connection(code, self, m.from, handlers);
      conns.set(m.from, conn);
      conn.offer();
    } else if (m.type === "signal" && m.from) {
      conns.get(m.from)?.receive(m.data ?? {});
    } else if (m.type === "peer-left" && m.from) {
      conns.get(m.from)?.close();
      conns.delete(m.from);
    }
  });
  return {
    code,
    close() {
      stream.close();
      conns.forEach((c) => c.close());
    },
  };
}

/** Join a room by code and answer the host's offer. */
export async function joinRoom(code: string, handlers: Handlers): Promise<Room> {
  code = code.trim().toUpperCase();
  const { peer: self } = await (await api(`/rooms/${code}/join`)).json();
  let conn: Connection | undefined;
  const stream = openStream(code, self, (m) => {
    if (m.type === "welcome" && m.host) {
      conn = new Connection(code, self, m.host, handlers);
    } else if (m.type === "signal") {
      conn?.receive(m.data ?? {});
    } else if (m.type === "room-closed") {
      handlers.onClosed("host closed the room");
    }
  });
  return {
    code,
    close() {
      stream.close();
      conn?.close();
    },
  };
}

function openStream(code: string, self: string, onMessage: (m: SignalMessage) => void): EventSource {
  const es = new EventSource(`${net.signalUrl}/rooms/${code}/peers/${self}/events`);
  es.onmessage = (e) => onMessage(JSON.parse(e.data));
  return es;
}

class Connection {
  private pc = new RTCPeerConnection(rtcConfig);
  private channels: Partial<Record<"events" | "state", RTCDataChannel>> = {};
  private remoteSet = false;
  private pendingCandidates: RTCIceCandidateInit[] = [];

  constructor(
    private code: string,
    private self: string,
    private remote: string,
    private handlers: Handlers,
  ) {
    this.pc.onicecandidate = (e) => e.candidate && this.signal({ candidate: e.candidate.toJSON() });
    this.pc.onconnectionstatechange = () => {
      if (this.pc.connectionState === "failed" || this.pc.connectionState === "closed") {
        handlers.onClosed(`connection ${this.pc.connectionState}`);
      }
    };
    this.pc.ondatachannel = (e) => this.track(e.channel);
  }

  /** Host side: create the channels, then send the offer. */
  async offer() {
    this.track(this.pc.createDataChannel("events"));
    this.track(this.pc.createDataChannel("state", net.stateChannel));
    await this.pc.setLocalDescription();
    this.signal({ sdp: this.pc.localDescription!.toJSON() });
  }

  async receive(data: NonNullable<SignalMessage["data"]>) {
    if (data.sdp) {
      await this.pc.setRemoteDescription(data.sdp);
      this.remoteSet = true;
      if (data.sdp.type === "offer") {
        await this.pc.setLocalDescription();
        this.signal({ sdp: this.pc.localDescription!.toJSON() });
      }
      for (const c of this.pendingCandidates) await this.pc.addIceCandidate(c);
      this.pendingCandidates = [];
    } else if (data.candidate) {
      // Candidates can outrun the offer or answer; addIceCandidate throws until a remote description is set.
      if (this.remoteSet) await this.pc.addIceCandidate(data.candidate);
      else this.pendingCandidates.push(data.candidate);
    }
  }

  close() {
    this.pc.close();
  }

  private track(ch: RTCDataChannel) {
    ch.binaryType = "arraybuffer";
    if (ch.label !== "events" && ch.label !== "state") return;
    this.channels[ch.label] = ch;
    ch.addEventListener("open", () => this.maybeReady());
    if (ch.readyState === "open") this.maybeReady();
  }

  private maybeReady() {
    const { events, state } = this.channels;
    if (events?.readyState !== "open" || state?.readyState !== "open") return;
    this.handlers.onLink({
      peerId: this.remote,
      events: channel(events, false),
      state: channel(state, true),
      onClose: (fn) => state.addEventListener("close", fn),
      close: () => this.close(),
    });
  }

  private signal(data: object) {
    api(`/rooms/${this.code}/peers/${this.self}/signal`, { to: this.remote, data }).catch((err) =>
      this.handlers.onClosed(String(err)),
    );
  }
}

function channel(ch: RTCDataChannel, unreliable: boolean): Channel {
  const { delayMs, jitterMs, loss } = lagSim;
  const sendNow = (data: string) => ch.readyState === "open" && ch.send(data);
  return {
    send(msg) {
      if (unreliable && Math.random() < loss) return;
      const data = JSON.stringify(msg);
      // No jitter on the reliable channel: equal delays keep it in order.
      const delay = delayMs + (unreliable ? Math.random() * jitterMs : 0);
      if (delay > 0) setTimeout(() => sendNow(data), delay);
      else sendNow(data);
    },
    onMessage(fn) {
      ch.addEventListener("message", (e) => {
        let msg: unknown;
        try {
          msg = JSON.parse(e.data);
        } catch {
          return;
        }
        fn(msg);
      });
    },
  };
}
