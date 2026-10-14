import type { SimPlayer, SimState } from "./sim";

// Messages on the unreliable "state" channel. Seqs count a guest's ticks from 1.
export interface InputFrame {
  seq: number;
  moveX: number;
  moveY: number;
}

/** Guest to host: every input the host has not acknowledged yet, oldest first. */
export interface InputsMsg {
  t: "in";
  inputs: InputFrame[];
}

/** Host to guest: the authoritative state, and the last input seq from this guest it has applied. */
export interface SnapshotMsg {
  t: "snap";
  ack: number;
  state: SimState;
}

// Messages on the reliable "events" channel.
export interface WelcomeMsg {
  t: "welcome";
  id: number;
}

export interface PingMsg {
  t: "ping" | "pong";
  at: number;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const isInt = (v: unknown): v is number => Number.isSafeInteger(v);
const int8 = (v: number) => Math.max(-128, Math.min(127, v));

/** The host trusts nothing from a guest: malformed frames are dropped, axes are clamped to int8. */
export function parseInputs(m: unknown): InputFrame[] | undefined {
  if (!isObj(m) || m.t !== "in" || !Array.isArray(m.inputs)) return undefined;
  const frames: InputFrame[] = [];
  for (const f of m.inputs) {
    if (isObj(f) && isInt(f.seq) && f.seq > 0 && isInt(f.moveX) && isInt(f.moveY)) {
      frames.push({ seq: f.seq, moveX: int8(f.moveX), moveY: int8(f.moveY) });
    }
  }
  return frames;
}

const isPlayer = (p: unknown): p is SimPlayer =>
  isObj(p) && isInt(p.id) && isInt(p.role) && isInt(p.x) && isInt(p.y);

export function parseSnapshot(m: unknown): SnapshotMsg | undefined {
  if (!isObj(m) || m.t !== "snap" || !isInt(m.ack) || !isObj(m.state)) return undefined;
  const { tick, players } = m.state;
  if (!isInt(tick) || !Array.isArray(players) || !players.every(isPlayer)) return undefined;
  return m as unknown as SnapshotMsg;
}

export function parseWelcome(m: unknown): WelcomeMsg | undefined {
  return isObj(m) && m.t === "welcome" && isInt(m.id) ? (m as unknown as WelcomeMsg) : undefined;
}

export function parsePing(m: unknown): PingMsg | undefined {
  return isObj(m) && (m.t === "ping" || m.t === "pong") && typeof m.at === "number" ? (m as unknown as PingMsg) : undefined;
}
