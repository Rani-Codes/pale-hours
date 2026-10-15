import { net, spawns } from "./config";
import { InputQueue } from "./inputqueue";
import { lerpYaw, SnapshotBuffer } from "./interp";
import { arrows, readActions, readIntent, readMove, wasd } from "./keys";
import { look } from "./look";
import type { Link } from "./net";
import { parseInputs, parseSnapshot, parseWelcome, type InputFrame, type SnapshotMsg } from "./protocol";
import { newPlayer, type PaleSim, type SimInput, type SimPlayer, type SimState, type World } from "./sim";

const M = 1_000_000; // micrometers per meter
const KILLER_ID = 1;

/** The sim's input for a player, from whatever moves they sent. */
function toInput(id: number, f: { moveX: number; moveY: number; yaw: number; act: boolean; skill: boolean; attack: boolean }): SimInput {
  return { id, moveX: f.moveX, moveY: f.moveY, yaw: f.yaw, act: f.act, skill: f.skill, attack: f.attack };
}

/** Each player draws skill checks from their own stream, so seed one per player from the match seed. */
function playerRng(seed: number, id: number): number {
  return (seed ^ Math.imul(id, 0x9e3779b1)) >>> 0 || 1;
}

const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];

/**
 * One way of running the match in this tab. Each rendered frame, the page
 * loop calls tick() for every sim tick due, then flush(), then view().
 */
export interface Session {
  tick(): void;
  flush?(): void;
  view(now: number, alpha: number): { players: SimPlayer[]; hud: string[]; self?: number; world: World };
}

/** Players drawn part-way between the last two ticks. */
function blend(prev: SimState, curr: SimState, alpha: number): SimPlayer[] {
  return curr.players.map((p) => {
    const a = prev.players.find((q) => q.id === p.id) ?? p;
    return { ...p, x: a.x + (p.x - a.x) * alpha, y: a.y + (p.y - a.y) * alpha, yaw: lerpYaw(a.yaw, p.yaw, alpha) };
  });
}

/** Offline: both players in this tab, killer on WASD and survivor on the arrow keys. */
export class LocalSession implements Session {
  private sim: PaleSim;
  private prev: SimState;
  private curr: SimState;

  constructor(sim: PaleSim) {
    this.sim = sim;
    const seed = randomSeed();
    sim.load({
      tick: 0,
      players: [
        newPlayer(KILLER_ID, sim.roles.killer, spawns.killer.x * M, spawns.killer.y * M, playerRng(seed, KILLER_ID)),
        newPlayer(2, sim.roles.survivor, spawns.survivors[0].x * M, spawns.survivors[0].y * M, playerRng(seed, 2)),
      ],
      gens: sim.genSites.map(() => 0),
      noise: sim.genSites.map(() => 0),
      gates: sim.gateSites.map(() => 0),
    });
    this.prev = this.curr = sim.state();
  }

  tick() {
    const { act, skill, attack } = readActions();
    this.sim.step([
      { id: KILLER_ID, ...readIntent(look.yaw, wasd), act: false, skill: false, attack },
      { id: 2, ...readMove(arrows), yaw: 0, act, skill },
    ]);
    this.prev = this.curr;
    this.curr = this.sim.state();
  }

  view(_now: number, alpha: number) {
    return {
      players: blend(this.prev, this.curr, alpha),
      hud: [`tick ${this.curr.tick}`, "killer: WASD + mouse, click to attack   survivor: arrow keys"],
      self: KILLER_ID,
      world: this.curr,
    };
  }
}

interface Guest {
  link: Link;
  queue: InputQueue;
}

/** One resolved swing, as the host saw it. For the tools. */
export interface SwingLog {
  tick: number;
  hit: boolean;
  viewLagMs: number;
  killer: { x: number; y: number; yaw: number };
  /** Survivors as the killer's screen last drew them before the swing landed. */
  drawn: { id: number; x: number; y: number }[];
  /** Survivors where the host had them on the tick it landed. */
  now: { id: number; x: number; y: number }[];
}

/** Snapshots leave out position trails: only the host resolves swings. */
function forGuests(s: SimState): SimState {
  return { ...s, players: s.players.map(({ trail: _, ...p }) => p) };
}

/** The killer's tab: the only authority. Applies guest inputs and sends each guest snapshots. */
export class HostSession implements Session {
  private sim: PaleSim;
  private guests = new Map<number, Guest>();
  private seed: number;
  private prev: SimState;
  private curr: SimState;
  /** The host tick the last drawn frame showed, between prev and curr. */
  private drawnTick = 0;
  private drawn: SimPlayer[] = [];
  readonly swings: SwingLog[] = [];

  constructor(sim: PaleSim) {
    this.sim = sim;
    this.seed = randomSeed();
    sim.load({
      tick: 0,
      players: [newPlayer(KILLER_ID, sim.roles.killer, spawns.killer.x * M, spawns.killer.y * M, playerRng(this.seed, KILLER_ID))],
      gens: sim.genSites.map(() => 0),
      noise: sim.genSites.map(() => 0),
      gates: sim.gateSites.map(() => 0),
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
    this.edit((s) => s.players.push(newPlayer(id, this.sim.roles.survivor, spawns.survivors[slot].x * M, spawns.survivors[slot].y * M, playerRng(this.seed, id))));

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
    // The killer is in this tab and sees the host's own state, drawn up to a
    // couple of ticks behind the one being stepped. A swing landing this tick
    // is judged against what that last frame showed.
    const viewLagMs = Math.round(Math.max(0, this.curr.tick + 1 - this.drawnTick) * (1000 / this.sim.tickRate));
    const { act, attack } = readActions();
    const inputs: SimInput[] = [{ ...toInput(KILLER_ID, { ...readIntent(look.yaw, wasd, arrows), act, skill: false, attack }), viewLagMs }];
    for (const [id, g] of this.guests) inputs.push(toInput(id, g.queue.take()));
    this.sim.step(inputs);
    this.prev = this.curr;
    this.curr = this.sim.state();
    this.logSwing(viewLagMs);

    const rate = net.snapshotRate / this.sim.tickRate;
    if (Math.floor(this.curr.tick * rate) === Math.floor((this.curr.tick - 1) * rate)) return;
    const snap = forGuests(this.curr);
    for (const g of this.guests.values()) g.link.state.send({ t: "snap", ack: g.queue.ack, state: snap });
  }

  private logSwing(viewLagMs: number) {
    const was = this.prev.players.find((p) => p.id === KILLER_ID);
    const k = this.curr.players.find((p) => p.id === KILLER_ID);
    if (!was || !k || was.swing !== this.sim.swing.windup || k.swing !== this.sim.swing.recover) return;
    const pos = (p: SimPlayer) => ({ id: p.id, x: p.x, y: p.y });
    const survivors = (ps: SimPlayer[]) => ps.filter((p) => p.role === this.sim.roles.survivor).map(pos);
    this.swings.push({
      tick: this.curr.tick,
      hit: k.swingResult === this.sim.swing.hit,
      viewLagMs,
      killer: { x: k.x, y: k.y, yaw: k.yaw },
      drawn: survivors(this.drawn),
      now: survivors(this.curr.players),
    });
    if (this.swings.length > 200) this.swings.shift();
  }

  view(_now: number, alpha: number) {
    const hud = [`hosting   tick ${this.curr.tick}   killer: WASD or arrows, click to attack`];
    for (const [id, g] of this.guests) hud.push(`guest ${id}: input queue ${g.queue.depth}, dropped ${g.queue.dropped}`);
    this.drawnTick = this.prev.tick + (this.curr.tick - this.prev.tick) * alpha;
    this.drawn = blend(this.prev, this.curr, alpha);
    return { players: this.drawn, hud, self: KILLER_ID, world: this.curr };
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

    const frame = { seq: ++this.seq, ...readIntent(look.yaw, wasd, arrows), ...readActions() };
    this.unacked.push(frame);
    if (this.unacked.length > net.maxUnackedInputs) this.unacked.shift();
    this.sim.step([toInput(this.selfId, frame)]);
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
    for (const f of this.unacked) this.sim.step([toInput(this.selfId!, f)]);
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
    const remote = this.remote.sample(now);
    const others = remote.filter((p) => p.id !== this.selfId);
    let self = this.prev && this.curr ? blend(this.prev, this.curr, alpha).filter((p) => p.id === this.selfId) : [];
    // Carried, the guest goes where the killer goes, so draw it on the same clock as the killer.
    if (self[0]?.carried) self = remote.filter((p) => p.id === this.selfId);
    return {
      players: [...others, ...self],
      self: this.selfId,
      world: this.curr ?? this.newest?.state ?? { gens: [], noise: [], gates: [] },
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
