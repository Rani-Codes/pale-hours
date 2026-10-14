import { net, spawns } from "./config";
import { InputQueue } from "./inputqueue";
import { SnapshotBuffer } from "./interp";
import { arrows, readMove, wasd } from "./keys";
import type { Link } from "./net";
import { parseInputs, parseSnapshot, parseWelcome, type InputFrame, type SnapshotMsg } from "./protocol";
import type { PaleSim, SimPlayer, SimState } from "./sim";

const M = 1_000_000; // micrometers per meter
const KILLER_ID = 1;

/**
 * One way of running the match in this tab. Each rendered frame, the page
 * loop calls tick() for every sim tick due, then flush(), then view().
 */
export interface Session {
  tick(): void;
  flush?(): void;
  view(now: number, alpha: number): { players: SimPlayer[]; hud: string[] };
}

/** Players drawn part-way between the last two ticks. */
function blend(prev: SimState, curr: SimState, alpha: number): SimPlayer[] {
  return curr.players.map((p) => {
    const a = prev.players.find((q) => q.id === p.id) ?? p;
    return { ...p, x: a.x + (p.x - a.x) * alpha, y: a.y + (p.y - a.y) * alpha };
  });
}

/** Offline: both players in this tab, killer on WASD and survivor on the arrow keys. */
export class LocalSession implements Session {
  private sim: PaleSim;
  private prev: SimState;
  private curr: SimState;

  constructor(sim: PaleSim) {
    this.sim = sim;
    sim.load({
      tick: 0,
      players: [
        { id: KILLER_ID, role: sim.roles.killer, x: spawns.killer.x * M, y: spawns.killer.y * M },
        { id: 2, role: sim.roles.survivor, x: spawns.survivors[0].x * M, y: spawns.survivors[0].y * M },
      ],
    });
    this.prev = this.curr = sim.state();
  }

  tick() {
    this.sim.step([
      { id: KILLER_ID, ...readMove(wasd) },
      { id: 2, ...readMove(arrows) },
    ]);
    this.prev = this.curr;
    this.curr = this.sim.state();
  }

  view(_now: number, alpha: number) {
    return {
      players: blend(this.prev, this.curr, alpha),
      hud: [`tick ${this.curr.tick}`, "killer: WASD   survivor: arrow keys"],
    };
  }
}

interface Guest {
  link: Link;
  queue: InputQueue;
}

/** The killer's tab: the only authority. Applies guest inputs and sends each guest snapshots. */
export class HostSession implements Session {
  private sim: PaleSim;
  private guests = new Map<number, Guest>();
  private prev: SimState;
  private curr: SimState;

  constructor(sim: PaleSim) {
    this.sim = sim;
    sim.load({
      tick: 0,
      players: [{ id: KILLER_ID, role: sim.roles.killer, x: spawns.killer.x * M, y: spawns.killer.y * M }],
    });
    this.prev = this.curr = sim.state();
  }

  addGuest(link: Link) {
    const slot = spawns.survivors.findIndex((_, i) => !this.guests.has(i + 2));
    if (slot < 0) return link.close();
    const id = slot + 2;
    const queue = new InputQueue({
      backlogWindowTicks: net.inputBacklogWindowTicks,
      backlogSpare: net.inputBacklogSpare,
      maxQueued: net.maxQueuedInputs,
    });
    this.guests.set(id, { link, queue });
    this.edit((s) => s.players.push({ id, role: this.sim.roles.survivor, x: spawns.survivors[slot].x * M, y: spawns.survivors[slot].y * M }));

    link.state.onMessage((m) => {
      const frames = parseInputs(m);
      if (frames) queue.push(frames);
    });
    link.onClose(() => {
      this.guests.delete(id);
      this.edit((s) => (s.players = s.players.filter((p) => p.id !== id)));
    });
    link.events.send({ t: "welcome", id });
  }

  private edit(change: (s: SimState) => void) {
    const s = this.sim.state();
    change(s);
    this.sim.load(s);
    this.curr = this.sim.state();
  }

  tick() {
    const inputs = [{ id: KILLER_ID, ...readMove(wasd, arrows) }];
    for (const [id, g] of this.guests) inputs.push({ id, ...g.queue.take() });
    this.sim.step(inputs);
    this.prev = this.curr;
    this.curr = this.sim.state();

    const rate = net.snapshotRate / this.sim.tickRate;
    if (Math.floor(this.curr.tick * rate) === Math.floor((this.curr.tick - 1) * rate)) return;
    for (const g of this.guests.values()) g.link.state.send({ t: "snap", ack: g.queue.ack, state: this.curr });
  }

  view(_now: number, alpha: number) {
    const hud = [`hosting   tick ${this.curr.tick}   killer: WASD or arrows`];
    for (const [id, g] of this.guests) hud.push(`guest ${id}: input queue ${g.queue.depth}, dropped ${g.queue.dropped}`);
    return { players: blend(this.prev, this.curr, alpha), hud };
  }

  stats() {
    return {
      tick: this.curr.tick,
      guests: [...this.guests].map(([id, g]) => ({ id, ack: g.queue.ack, depth: g.queue.depth, dropped: g.queue.dropped })),
    };
  }
}

/**
 * A survivor's tab. Predicts its own player from local inputs, replays the
 * unacknowledged ones on top of each host snapshot, and draws everyone else
 * from the interpolation buffer.
 */
export class GuestSession implements Session {
  private sim: PaleSim;
  private link: Link;
  private selfId: number | undefined;
  private seq = 0;
  private unacked: InputFrame[] = [];
  private newest: SnapshotMsg | undefined;
  private reconciledTick = -1;
  private remote: SnapshotBuffer;
  private prev: SimState | undefined;
  private curr: SimState | undefined;
  private corrections = 0;
  private lastCorrectionM = 0;

  constructor(sim: PaleSim, link: Link) {
    this.sim = sim;
    this.link = link;
    this.remote = new SnapshotBuffer(1000 / sim.tickRate, net.interpDelayMs, net.clockSmoothing);
    link.events.onMessage((m) => {
      const w = parseWelcome(m);
      if (w) this.selfId = w.id;
    });
    link.state.onMessage((m) => {
      const snap = parseSnapshot(m);
      if (!snap || snap.state.tick <= (this.newest?.state.tick ?? -1)) return;
      this.newest = snap;
      this.remote.push(snap.state, performance.now());
    });
  }

  tick() {
    if (this.selfId === undefined) return;
    if (this.newest && this.newest.state.tick > this.reconciledTick) this.reconcile(this.newest);
    if (!this.curr) return;

    const frame = { seq: ++this.seq, ...readMove(wasd, arrows) };
    this.unacked.push(frame);
    if (this.unacked.length > net.maxUnackedInputs) this.unacked.shift();
    this.sim.step([{ id: this.selfId, moveX: frame.moveX, moveY: frame.moveY }]);
    this.prev = this.curr;
    this.curr = this.sim.state();
  }

  /** One packet per frame carries every unacknowledged input, so a lost packet is covered by the next. */
  flush() {
    if (this.unacked.length > 0) this.link.state.send({ t: "in", inputs: this.unacked });
  }

  private reconcile(snap: SnapshotMsg) {
    this.reconciledTick = snap.state.tick;
    const before = this.curr && this.self(this.curr);
    this.unacked = this.unacked.filter((f) => f.seq > snap.ack);
    this.sim.load(snap.state);
    for (const f of this.unacked) this.sim.step([{ id: this.selfId!, moveX: f.moveX, moveY: f.moveY }]);
    this.curr = this.sim.state();
    this.prev ??= this.curr;

    const after = this.self(this.curr);
    if (before && after && (before.x !== after.x || before.y !== after.y)) {
      this.corrections++;
      this.lastCorrectionM = Math.hypot(after.x - before.x, after.y - before.y) / M;
    }
  }

  private self(s: SimState): SimPlayer | undefined {
    return s.players.find((p) => p.id === this.selfId);
  }

  view(now: number, alpha: number) {
    const others = this.remote.sample(now).filter((p) => p.id !== this.selfId);
    const self = this.prev && this.curr ? blend(this.prev, this.curr, alpha).filter((p) => p.id === this.selfId) : [];
    return {
      players: [...others, ...self],
      hud: [
        this.selfId === undefined ? "joined, waiting for host" : `survivor ${this.selfId}   move: WASD or arrows`,
        `unacked inputs ${this.unacked.length}   corrections ${this.corrections} (last ${this.lastCorrectionM.toFixed(3)} m)`,
      ],
    };
  }

  stats() {
    return {
      selfId: this.selfId,
      seq: this.seq,
      unacked: this.unacked.length,
      corrections: this.corrections,
      predicted: this.curr && this.self(this.curr),
      renderTick: this.remote.renderTick(performance.now()),
      starved: this.remote.starved,
      newestTick: this.newest?.state.tick,
    };
  }
}
