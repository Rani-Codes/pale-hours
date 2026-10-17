import type { Role, Seat } from "./room";
import type { SimPlayer, SimState } from "./sim";

// Messages on the unreliable "state" channel. Seqs count a guest's ticks from 1.
export interface InputFrame {
  seq: number;
  moveX: number;
  moveY: number;
  /** Facing in 1/65536 turns. */
  yaw: number;
  /** Holding the repair key. */
  act: boolean;
  /** Pressed the skill check key this tick. */
  skill: boolean;
  /** Pressed attack this tick. Only a killer's counts. */
  attack: boolean;
  /** Holding the crouch key. Only a survivor's counts. */
  crouch: boolean;
  /** Holding Q, the second struggle key. Only a carried survivor's counts. */
  alt: boolean;
  /**
   * The host tick this guest's screen was drawing everyone else at, for lag
   * compensation when the guest is the killer. The host caps what it does with it.
   */
  seen?: number;
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

/** Host to guest, on every change: the room's seats, who you are, and whether the match is on. */
export interface LobbyMsg {
  t: "lobby";
  you: number;
  seats: Seat[];
  started: boolean;
}

/** Guest to host: the role this guest wants. The host decides. */
export interface PickMsg {
  t: "pick";
  role: Role;
}

/** Guest to host: the name this guest wants. The host cleans it and makes it unique. */
export interface NameMsg {
  t: "name";
  name: string;
}

/** Host to guest before closing the link: why they cannot join. */
export interface RefusedMsg {
  t: "refused";
  reason: string;
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
    if (isObj(f) && isInt(f.seq) && f.seq > 0 && isInt(f.moveX) && isInt(f.moveY) && isInt(f.yaw)) {
      frames.push({ seq: f.seq, moveX: int8(f.moveX), moveY: int8(f.moveY), yaw: f.yaw & 0xffff, act: f.act === true, skill: f.skill === true, attack: f.attack === true, crouch: f.crouch === true, alt: f.alt === true, seen: typeof f.seen === "number" && Number.isFinite(f.seen) ? f.seen : undefined });
    }
  }
  return frames;
}

const isPlayer = (p: unknown): p is SimPlayer =>
  isObj(p) && isInt(p.id) && isInt(p.role) && isInt(p.x) && isInt(p.y) && isInt(p.yaw) && isInt(p.rng) && isInt(p.checkAge) && isInt(p.health) && isInt(p.swing);

export function parseSnapshot(m: unknown): SnapshotMsg | undefined {
  if (!isObj(m) || m.t !== "snap" || !isInt(m.ack) || !isObj(m.state)) return undefined;
  const { tick, players, gens, noise, gates, pallets, palletBreak } = m.state;
  if (!isInt(tick) || !Array.isArray(players) || !players.every(isPlayer)) return undefined;
  for (const list of [gens, noise, gates, pallets, palletBreak]) if (!Array.isArray(list) || !list.every(isInt)) return undefined;
  return m as unknown as SnapshotMsg;
}

const isRole = (r: unknown): r is Role => r === "killer" || r === "survivor";

export function parseLobby(m: unknown): LobbyMsg | undefined {
  if (!isObj(m) || m.t !== "lobby" || !isInt(m.you) || typeof m.started !== "boolean" || !Array.isArray(m.seats)) return undefined;
  const seats = m.seats.filter((s): s is Seat => isObj(s) && isInt(s.id) && (s.role === undefined || isRole(s.role)) && (s.name === undefined || typeof s.name === "string"));
  return seats.length === m.seats.length ? { t: "lobby", you: m.you, seats, started: m.started } : undefined;
}

export function parsePick(m: unknown): PickMsg | undefined {
  return isObj(m) && m.t === "pick" && isRole(m.role) ? { t: "pick", role: m.role } : undefined;
}

export function parseName(m: unknown): NameMsg | undefined {
  return isObj(m) && m.t === "name" && typeof m.name === "string" ? { t: "name", name: m.name.slice(0, 100) } : undefined;
}

export function parseRefused(m: unknown): RefusedMsg | undefined {
  return isObj(m) && m.t === "refused" && typeof m.reason === "string" ? { t: "refused", reason: m.reason.slice(0, 200) } : undefined;
}

export function parsePing(m: unknown): PingMsg | undefined {
  return isObj(m) && (m.t === "ping" || m.t === "pong") && typeof m.at === "number" ? (m as unknown as PingMsg) : undefined;
}
