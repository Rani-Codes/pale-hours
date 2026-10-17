import { net } from "./config";
import { InputQueue, type Move } from "./inputqueue";
import { lerpYaw, SnapshotBuffer } from "./interp";
import { arrows, readActions, readIntent, wasd } from "./keys";
import { look } from "./look";
import type { Link } from "./net";
import { parseInputs, parseLobby, parseName, parsePick, parseRefused, parseSnapshot, type InputFrame, type SnapshotMsg } from "./protocol";
import { lineup, MAX_PLAYERS, pick, rename, startProblem, type Role, type Seat } from "./room";
import { newPlayer, type PaleSim, type SimInput, type SimPlayer, type SimState, type World } from "./sim";

const M = 1_000_000; // micrometers per meter
const HOST_ID = 1; // the room creator; guests take 2 to 5

/** The sim's input for a player, from whatever moves they sent. */
function toInput(id: number, f: { moveX: number; moveY: number; yaw: number; act: boolean; skill: boolean; attack: boolean; crouch: boolean }): SimInput {
  return { id, moveX: f.moveX, moveY: f.moveY, yaw: f.yaw, act: f.act, skill: f.skill, attack: f.attack, crouch: f.crouch };
}

/** Each player draws skill checks from their own stream, so seed one per player from the match seed. */
function playerRng(seed: number, id: number): number {
  return (seed ^ Math.imul(id, 0x9e3779b1)) >>> 0 || 1;
}

const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];

/** What the lobby panel shows. */
export interface RoomView {
  you: number;
  seats: Seat[];
  started: boolean;
  isHost: boolean;
  /** Why Start is not offered yet; undefined when it is. */
  problem?: string;
  refused?: string;
}

/**
 * One way of running this tab. Each rendered frame, the page loop calls
 * tick() for every sim tick due, then flush(), then view().
 */
export interface Session {
  tick(): void;
  flush?(): void;
  view(now: number, alpha: number): { players: SimPlayer[]; self?: number; world: World };
  room?(): RoomView;
  pick?(role: Role): void;
  setName?(name: string): void;
}

/** Players drawn part-way between the last two ticks. */
function blend(prev: SimState, curr: SimState, alpha: number): SimPlayer[] {
  return curr.players.map((p) => {
    const a = prev.players.find((q) => q.id === p.id) ?? p;
    return { ...p, x: a.x + (p.x - a.x) * alpha, y: a.y + (p.y - a.y) * alpha, yaw: lerpYaw(a.yaw, p.yaw, alpha) };
  });
}

const emptyWorld = (sim: PaleSim): World => ({ gens: sim.genSites.map(() => 0), noise: sim.genSites.map(() => 0), gates: sim.gateSites.map(() => 0), pallets: sim.palletSites.map(() => 0), palletBreak: sim.palletSites.map(() => 0), over: false });

/** Not in a room yet: nothing runs, the map is shown from above behind the lobby panel. */
export class IdleSession implements Session {
  private world: World;
  constructor(sim: PaleSim) {
    this.world = emptyWorld(sim);
  }
  tick() {}
  view() {
    return { players: [], world: this.world };
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

/**
 * The room creator's tab: the only authority. Runs the lobby, then the
 * match, whichever role its own player picked. Applies guest inputs and
 * sends each guest snapshots.
 */
export class HostSession implements Session {
  private sim: PaleSim;
  private guests = new Map<number, Guest>();
  private seats: Seat[];
  private started = false;
  private killerId = 0;
  private seed = 0;
  private prev: SimState;
  private curr: SimState;
  /** The host tick the last drawn frame showed, between prev and curr. */
  private drawnTick = 0;
  private drawn: SimPlayer[] = [];
  readonly swings: SwingLog[] = [];

  constructor(sim: PaleSim, name = "") {
    this.sim = sim;
    this.seats = rename([{ id: HOST_ID }], HOST_ID, name);
    sim.load({ tick: 0, players: [], ...emptyWorld(sim) });
    this.prev = this.curr = sim.state();
  }

  addGuest(link: Link) {
    const refuse = (reason: string) => {
      link.events.send({ t: "refused", reason });
      setTimeout(() => link.close(), 500); // let the reason arrive first
    };
    if (this.started) return refuse("the match has already started");
    const id = [2, 3, 4, 5].find((n) => !this.guests.has(n));
    if (id === undefined || this.seats.length >= MAX_PLAYERS) return refuse("the room is full");
    const queue = new InputQueue({
      backlogWindowTicks: net.inputBacklogWindowTicks,
      backlogSpare: net.inputBacklogSpare,
      maxQueued: net.maxQueuedInputs,
    });
    this.guests.set(id, { link, queue });
    this.seats = [...this.seats, { id }];
    link.state.onMessage((m) => {
      const frames = parseInputs(m);
      if (frames) queue.push(frames);
    });
    link.events.onMessage((m) => {
      const p = parsePick(m);
      if (p && !this.started) this.setRole(id, p.role);
      const n = parseName(m);
      if (n && !this.started) this.setName(n.name, id);
    });
    link.onClose(() => {
      this.guests.delete(id);
      this.seats = this.seats.filter((s) => s.id !== id);
      if (this.started) this.edit((s) => (s.players = s.players.filter((p) => p.id !== id)));
      this.broadcast();
    });
    this.broadcast();
  }

  pick(role: Role) {
    if (!this.started) this.setRole(HOST_ID, role);
  }

  setName(name: string, id = HOST_ID) {
    this.seats = rename(this.seats, id, name);
    this.broadcast();
  }

  private setRole(id: number, role: Role) {
    this.seats = pick(this.seats, id, role);
    this.broadcast();
  }

  /** Begin the match, if the lobby allows it. */
  start() {
    if (this.started || startProblem(this.seats)) return;
    this.started = true;
    this.newMatch();
    this.broadcast();
  }

  /** A fresh match with the same roles, everyone back at their spawns. The tick keeps counting so guests keep accepting snapshots. */
  rematch() {
    if (this.started) this.newMatch();
  }

  /** The match is done with: everyone back to the lobby with their names and picks, free to change them. */
  toLobby() {
    if (!this.started) return;
    this.started = false;
    this.sim.load({ tick: this.curr.tick, players: [], ...emptyWorld(this.sim) });
    this.prev = this.curr = this.sim.state();
    this.broadcast();
  }

  private newMatch() {
    this.seed = randomSeed();
    const s = this.sim;
    const { killer, survivors } = lineup(this.seats.filter((seat) => seat.id === HOST_ID || this.guests.has(seat.id)));
    this.killerId = killer;
    const places = s.spawns(this.seed, survivors.length);
    s.load({
      tick: this.curr.tick,
      players: [
        newPlayer(killer, s.roles.killer, places[0].x, places[0].y, playerRng(this.seed, killer)),
        ...survivors.map((id, i) => newPlayer(id, s.roles.survivor, places[i + 1].x, places[i + 1].y, playerRng(this.seed, id))),
      ],
      ...emptyWorld(s),
    });
    this.prev = this.curr = s.state();
  }

  private broadcast() {
    for (const [id, g] of this.guests) g.link.events.send({ t: "lobby", you: id, seats: this.seats, started: this.started });
  }

  room(): RoomView {
    return { you: HOST_ID, seats: this.seats, started: this.started, isHost: true, problem: startProblem(this.seats) };
  }

  private edit(change: (s: SimState) => void) {
    const s = this.sim.state();
    change(s);
    this.sim.load(s);
    this.curr = this.sim.state();
  }

  tick() {
    if (!this.started) return;
    const next = this.curr.tick + 1;
    const tickMs = 1000 / this.sim.tickRate;
    const actions = readActions();
    const mine = { ...toInput(HOST_ID, { ...readIntent(look.yaw, wasd, arrows), ...actions }) };
    // A swing landing this tick is judged against what the killer last saw.
    // The host's own screen draws its own state a tick or two behind the one
    // being stepped; a guest says which host tick it was drawing.
    const lagFor = (seen: number | undefined) => (seen === undefined ? 0 : Math.round(Math.max(0, next - seen) * tickMs));
    let killerLag = 0;
    const inputs: SimInput[] = [];
    if (this.killerId === HOST_ID) {
      killerLag = lagFor(this.drawnTick);
      inputs.push({ ...mine, viewLagMs: killerLag });
    } else {
      inputs.push(mine);
    }
    for (const [id, g] of this.guests) {
      const move: Move = g.queue.take();
      if (id === this.killerId) {
        killerLag = lagFor(move.seen);
        inputs.push({ ...toInput(id, move), viewLagMs: killerLag });
      } else {
        inputs.push(toInput(id, move));
      }
    }
    this.sim.step(inputs);
    this.prev = this.curr;
    this.curr = this.sim.state();
    this.logSwing(killerLag);

    const rate = net.snapshotRate / this.sim.tickRate;
    if (Math.floor(this.curr.tick * rate) === Math.floor((this.curr.tick - 1) * rate)) return;
    const snap = forGuests(this.curr);
    for (const g of this.guests.values()) g.link.state.send({ t: "snap", ack: g.queue.ack, state: snap });
  }

  private logSwing(viewLagMs: number) {
    const was = this.prev.players.find((p) => p.id === this.killerId);
    const k = this.curr.players.find((p) => p.id === this.killerId);
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
    if (!this.started) return { players: [], world: this.curr };
    this.drawnTick = this.prev.tick + (this.curr.tick - this.prev.tick) * alpha;
    this.drawn = blend(this.prev, this.curr, alpha);
    return { players: this.drawn, self: HOST_ID, world: this.curr };
  }

  stats() {
    return {
      tick: this.curr.tick,
      started: this.started,
      killerId: this.killerId,
      guests: [...this.guests].map(([id, g]) => ({ id, ack: g.queue.ack, depth: g.queue.depth, dropped: g.queue.dropped })),
    };
  }
}

/**
 * A guest's tab, killer or survivor. Predicts its own player from local
 * inputs, replays the unacknowledged ones on top of each host snapshot, and
 * draws everyone else from the interpolation buffer.
 */
export class GuestSession implements Session {
  private sim: PaleSim;
  private link: Link;
  private name: string;
  private selfId: number | undefined;
  private seats: Seat[] = [];
  private started = false;
  private refused: string | undefined;
  private seq = 0;
  private unacked: InputFrame[] = [];
  private newest: SnapshotMsg | undefined;
  private reconciledTick = -1;
  private remote: SnapshotBuffer;
  private prev: SimState | undefined;
  private curr: SimState | undefined;
  private corrections = 0;

  constructor(sim: PaleSim, link: Link, name = "") {
    this.name = name;
    this.sim = sim;
    this.link = link;
    this.remote = new SnapshotBuffer(1000 / sim.tickRate, net.interpDelayMs, net.clockSmoothing);
    link.events.onMessage((m) => {
      const lobby = parseLobby(m);
      if (lobby) {
        // The first word from the host: tell it who we are. Later changes go out through setName.
        if (this.selfId === undefined && this.name) this.link.events.send({ t: "name", name: this.name });
        this.selfId = lobby.you;
        this.seats = lobby.seats;
        if (this.started && !lobby.started) this.leaveMatch();
        this.started = lobby.started;
      }
      const no = parseRefused(m);
      if (no) this.refused = no.reason;
    });
    link.state.onMessage((m) => {
      const snap = parseSnapshot(m);
      if (!snap || snap.state.tick <= (this.newest?.state.tick ?? -1)) return;
      this.newest = snap;
      this.remote.push(snap.state, performance.now());
    });
  }

  /** The host called the match off: forget it, so the lobby shows a clean room and the next start begins fresh. */
  private leaveMatch() {
    this.newest = this.prev = this.curr = undefined;
    this.unacked = [];
    this.remote = new SnapshotBuffer(1000 / this.sim.tickRate, net.interpDelayMs, net.clockSmoothing);
  }

  pick(role: Role) {
    this.link.events.send({ t: "pick", role });
  }

  setName(name: string) {
    this.name = name;
    this.link.events.send({ t: "name", name });
  }

  room(): RoomView {
    return { you: this.selfId ?? 0, seats: this.seats, started: this.started, isHost: false, problem: startProblem(this.seats), refused: this.refused };
  }

  tick() {
    if (this.selfId === undefined || !this.started) return;
    if (this.newest && this.newest.state.tick > this.reconciledTick) this.reconcile(this.newest);
    if (!this.curr || !this.self(this.curr)) return;

    // seen: the host tick the other players are drawn at, so the host can judge this tab's swings as it saw them.
    const seen = this.remote.renderTick(performance.now());
    const frame: InputFrame = { seq: ++this.seq, ...readIntent(look.yaw, wasd, arrows), ...readActions(), ...(Number.isFinite(seen) ? { seen } : {}) };
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
    }
  }

  private self(s: SimState): SimPlayer | undefined {
    return s.players.find((p) => p.id === this.selfId);
  }

  view(now: number, alpha: number) {
    const fallback = this.curr ?? this.newest?.state ?? { gens: [], noise: [], gates: [], pallets: [], palletBreak: [], over: false };
    if (!this.started) return { players: [], world: fallback };
    const remote = this.remote.sample(now);
    const others = remote.filter((p) => p.id !== this.selfId);
    let self = this.prev && this.curr ? blend(this.prev, this.curr, alpha).filter((p) => p.id === this.selfId) : [];
    // Carried, the guest goes where the killer goes, so draw it on the same clock as the killer.
    if (self[0]?.carried) self = remote.filter((p) => p.id === this.selfId);
    return {
      players: [...others, ...self],
      self: this.selfId,
      world: fallback,
    };
  }

  stats() {
    return {
      selfId: this.selfId,
      started: this.started,
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
