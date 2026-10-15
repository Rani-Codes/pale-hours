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
}

export interface SimState {
  tick: number;
  players: SimPlayer[];
  /** Repair progress in ticks, one per generator site. */
  gens: number[];
}

/** A player as they spawn: nothing repaired, no check pending. */
export function newPlayer(id: number, role: number, x: number, y: number, rng: number): SimPlayer {
  return { id, role, x, y, yaw: 0, repairing: false, skillHeld: false, checkActive: false, checkResult: 0, checkZone: 0, checkAge: 0, checkIn: 0, rng };
}

export interface SimInput {
  id: number;
  moveX: number;
  moveY: number;
  yaw: number;
  act: boolean;
  skill: boolean;
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
  repairRange: number;
  generatorHalf: number;
  check: { duration: number; zoneLen: number };
  roles: { survivor: number; killer: number };
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
