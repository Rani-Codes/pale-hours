export interface SimPlayer {
  id: number;
  role: number;
  x: number;
  y: number;
  /** Facing in 1/65536 turns: 0 is north, growing clockwise. */
  yaw: number;
  repairing: boolean;
  skillHeld: boolean;
  checkActive: boolean;
  /** 0 none, 1 hit, 2 miss: how the last check ended. */
  checkResult: number;
  checkZone: number;
  checkAge: number;
  checkIn: number;
  /** This player's skill check random stream. Seeded by the host when they join. */
  rng: number;
  /** Left through a gate: out of play. */
  escaped: boolean;
  /** 0 healthy, 1 injured, 2 downed (see PaleSim.health). */
  health: number;
  /** Ticks of sprint left after being hit. */
  boost: number;
  attackHeld: boolean;
  /** The killer's attack phase (see PaleSim.swing) and ticks left in it. */
  swing: number;
  swingTicks: number;
  /** How the killer's last swing ended: 0 none, then PaleSim.swing.hit or miss. */
  swingResult: number;
  /** Ticks spent downed and left alone; at PaleSim.recoverTicks they stand up injured. */
  recover: number;
  /** The downed teammate this survivor is getting up, or 0. */
  helping: number;
  actHeld: boolean;
  /** On the killer: the survivor being carried, or 0. */
  carrying: number;
  carried: boolean;
  /** 0, or the index into PaleSim.hookSites plus one. */
  onHook: number;
  /** Hook time used, ever; at PaleSim.hookTicks they are eliminated. */
  hookUsed: number;
  /** Ticks a teammate has held E to unhook them. */
  rescue: number;
  /** Died on a hook: out of play. */
  eliminated: boolean;
  /** Ticks the killer is stunned. */
  stun: number;
  /** Recent positions [x0, y0, x1, y1, ...] by tick % trail length, for lag compensation. Host only: snapshots leave it out. */
  trail?: number[];
}

export interface SimState {
  tick: number;
  players: SimPlayer[];
  /** Repair progress in ticks, one per generator site. */
  gens: number[];
  /** Ticks each generator stays loud after a missed check. */
  noise: number[];
  /** Hand-opening progress in ticks, one per gate site. */
  gates: number[];
  /** Every survivor has escaped or died. The match is frozen. */
  over?: boolean;
}

/** The part of the state that is not a player. */
export type World = Pick<SimState, "gens" | "noise" | "gates" | "over">;

/** A player as they spawn: nothing repaired, no check pending. */
export function newPlayer(id: number, role: number, x: number, y: number, rng: number): SimPlayer {
  return { id, role, x, y, yaw: 0, repairing: false, skillHeld: false, checkActive: false, checkResult: 0, checkZone: 0, checkAge: 0, checkIn: 0, rng, escaped: false, health: 0, boost: 0, attackHeld: false, swing: 0, swingTicks: 0, swingResult: 0,
    recover: 0, helping: 0, actHeld: false, carrying: 0, carried: false, onHook: 0, hookUsed: 0, rescue: 0, eliminated: false, stun: 0 };
}

export interface SimInput {
  id: number;
  moveX: number;
  moveY: number;
  yaw: number;
  act: boolean;
  skill: boolean;
  /** The killer's attack button, edge-triggered in the sim. */
  attack?: boolean;
  /** How far behind this tick the attacker's screen showed everyone else. The host measures it. */
  viewLagMs?: number;
}

/** An axis-aligned wall in micrometers. */
export interface Wall {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface PaleSim {
  tickRate: number;
  mapHalfExtent: number;
  walls: Wall[];
  /** Generator positions in micrometers, indexed like state().gens. */
  genSites: { x: number; y: number }[];
  /** Repair ticks that finish a generator. */
  genTicks: number;
  gateSites: { x: number; y: number }[];
  /** Hand-opening ticks that open a gate. */
  gateTicks: number;
  gateRange: number;
  /** Generators that must be done to power the gates. */
  gensRequired: number;
  noiseTicks: number;
  repairRange: number;
  generatorHalf: number;
  check: { duration: number; zoneLen: number };
  roles: { survivor: number; killer: number };
  health: { healthy: number; injured: number; downed: number };
  swing: { idle: number; windup: number; recover: number; hit: number; miss: number };
  rewindCapMs: number;
  hookSites: { x: number; y: number }[];
  hookTicks: number;
  hookRange: number;
  rescueTicks: number;
  rescueRange: number;
  reviveRange: number;
  pickupRange: number;
  recoverTicks: number;
  /** Hook ticks a missed hook skill check costs. */
  hookCheckPenalty: number;
  /** Whether a swing from (x, y) facing yaw would touch a survivor standing at (tx, ty) now. For the tools. */
  inReach(x: number, y: number, yaw: number, tx: number, ty: number): boolean;
  /** Replace the whole state, e.g. with a host snapshot. */
  load(state: SimState): void;
  step(inputs: SimInput[]): void;
  state(): SimState;
}

declare class Go {
  importObject: WebAssembly.Imports;
  run(instance: WebAssembly.Instance): Promise<void>;
}

declare global {
  var paleSim: PaleSim | undefined;
}

export async function loadSim(url: string): Promise<PaleSim> {
  const go = new Go();
  const { instance } = await WebAssembly.instantiateStreaming(fetch(url), go.importObject);
  go.run(instance);
  if (!globalThis.paleSim) throw new Error("sim.wasm did not register paleSim");
  return globalThis.paleSim;
}
