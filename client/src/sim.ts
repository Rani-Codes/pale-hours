export interface SimPlayer {
  id: number;
  role: number;
  x: number;
  y: number;
}

export interface SimState {
  tick: number;
  players: SimPlayer[];
}

export interface SimInput {
  id: number;
  moveX: number;
  moveY: number;
}

export interface PaleSim {
  tickRate: number;
  mapHalfExtent: number;
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
