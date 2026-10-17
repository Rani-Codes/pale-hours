// One signaling room. Peers only exchange opaque signaling blobs; game
// traffic never touches it. Pure: the timer is passed in, so tests drive it.

export type Message =
  | { type: "welcome"; host: string }
  | { type: "peer-joined"; from: string }
  | { type: "peer-left"; from: string }
  | { type: "signal"; from: string; data: unknown }
  | { type: "room-closed" };

/** A peer's open event socket. */
export interface Socket {
  send(m: Message): void;
  close(): void;
}

export interface RoomOptions {
  maxPeers: number;
  // A peer only leaves when its event socket closes, so one that never opens a
  // socket would hold its seat (or, for a host, the whole room) forever.
  attachWithinMs: number;
  maxPending: number; // messages kept for a peer before its socket opens
  after(ms: number, f: () => void): void;
  onClose(): void;
}

interface Peer {
  id: string;
  socket?: Socket;
  pending: Message[];
}

// No 0/O, 1/I/L so codes survive being read aloud.
const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function randomString(n: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export class Room {
  readonly host: string;
  private peers = new Map<string, Peer>();
  private opts: RoomOptions;
  private closed = false;

  constructor(opts: RoomOptions) {
    this.opts = opts;
    this.host = this.add().id;
  }

  /** Returns the new peer's id. */
  join(): string | "room-full" {
    if (this.peers.size >= this.opts.maxPeers) return "room-full";
    const p = this.add();
    for (const other of this.peers.values()) {
      if (other !== p) this.deliver(other, { type: "peer-joined", from: p.id });
    }
    this.deliver(p, { type: "welcome", host: this.host });
    return p.id;
  }

  attach(id: string, socket: Socket): boolean {
    const p = this.peers.get(id);
    if (!p) return false;
    p.socket?.close();
    p.socket = socket;
    for (const m of p.pending.splice(0)) socket.send(m);
    return true;
  }

  relay(from: string, to: string, data: unknown): boolean {
    const dst = this.peers.get(to);
    if (!dst || !this.peers.has(from)) return false;
    this.deliver(dst, { type: "signal", from, data });
    return true;
  }

  /** The peer's socket closed. A stale socket from a replaced attach is ignored. */
  detach(id: string, socket: Socket): void {
    if (this.peers.get(id)?.socket === socket) this.leave(id);
  }

  private add(): Peer {
    let id: string;
    do id = randomString(8);
    while (this.peers.has(id));
    const p: Peer = { id, pending: [] };
    this.peers.set(id, p);
    this.opts.after(this.opts.attachWithinMs, () => {
      if (this.peers.get(id) === p && !p.socket) this.leave(id);
    });
    return p;
  }

  private leave(id: string): void {
    if (this.closed || !this.peers.delete(id)) return;
    if (id === this.host) {
      this.closed = true;
      for (const p of this.peers.values()) {
        this.deliver(p, { type: "room-closed" });
        p.socket?.close();
      }
      this.peers.clear();
      this.opts.onClose();
      return;
    }
    for (const p of this.peers.values()) this.deliver(p, { type: "peer-left", from: id });
  }

  // A peer that has not opened its socket yet keeps a bounded backlog.
  private deliver(p: Peer, m: Message): void {
    if (p.socket) p.socket.send(m);
    else if (p.pending.length < this.opts.maxPending) p.pending.push(m);
  }
}
