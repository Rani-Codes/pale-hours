/**
 * The lobby's rules, kept pure so they are easy to test. The host owns the
 * seat list and applies every pick; guests only ask.
 */

export type Role = "killer" | "survivor";

/** One player in the room. Their role is unset until they pick. */
export interface Seat {
  id: number;
  role?: Role;
  /** What the room calls them; the host makes it unique. */
  name?: string;
}

export const MAX_PLAYERS = 5;
export const MAX_SURVIVORS = MAX_PLAYERS - 1;

/** Apply a pick. Killer is refused if someone else has it; survivor once four others have it. */
export function pick(seats: Seat[], id: number, role: Role): Seat[] {
  const others = seats.filter((s) => s.id !== id);
  if (role === "killer" && others.some((s) => s.role === "killer")) return seats;
  if (role === "survivor" && others.filter((s) => s.role === "survivor").length >= MAX_SURVIVORS) return seats;
  return seats.map((s) => (s.id === id ? { ...s, role } : s));
}

/** Why the match cannot start yet, or undefined when it can. */
export function startProblem(seats: Seat[]): string | undefined {
  if (seats.length < 2) return "waiting for at least one more player";
  if (seats.some((s) => !s.role)) return "everyone has to pick a role";
  if (!seats.some((s) => s.role === "killer")) return "someone has to play the killer";
  if (!seats.some((s) => s.role === "survivor")) return "someone has to play a survivor";
  return undefined;
}

/** Seats with a role, in the order they get survivor spawns: by player ID. */
export function lineup(seats: Seat[]): { killer: number; survivors: number[] } {
  const killer = seats.find((s) => s.role === "killer")!.id;
  const survivors = seats.filter((s) => s.role === "survivor").map((s) => s.id).sort((a, b) => a - b);
  return { killer, survivors };
}

export const MAX_NAME = 16;

const ADJECTIVES = ["Pale", "Quiet", "Hollow", "Restless", "Bitter", "Hushed", "Wary", "Faded", "Crooked", "Lonely", "Dim", "Ashen"];
const NOUNS = ["Moth", "Lantern", "Crow", "Hare", "Ember", "Wren", "Fox", "Thistle", "Owl", "Cinder", "Marrow", "Sparrow"];

/** A name to start with, e.g. "HushedCrow". rand returns [0, 1). */
export function randomName(rand: () => number = Math.random): string {
  const pickOne = (list: string[]) => list[Math.floor(rand() * list.length)];
  return pickOne(ADJECTIVES) + pickOne(NOUNS);
}

/** Control characters out, whitespace collapsed, capped at MAX_NAME. Empty when nothing is left. */
export function cleanName(name: string): string {
  // eslint-disable-next-line no-control-regex
  return name.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, MAX_NAME).trim();
}

/** Give a player a name, or keep their old one if the new one is empty. A name another player has gets a number on the end. */
export function rename(seats: Seat[], id: number, wanted: string): Seat[] {
  const base = cleanName(wanted);
  if (!base) return seats;
  const taken = new Set(seats.filter((s) => s.id !== id && s.name).map((s) => s.name!.toLowerCase()));
  let name = base;
  for (let n = 2; taken.has(name.toLowerCase()); n++) name = base.slice(0, MAX_NAME - String(n).length - 1) + " " + n;
  return seats.map((s) => (s.id === id ? { ...s, name } : s));
}

/** How a player is called in the room: their name, or "player N" before they have one. */
export function nameOf(seats: Seat[], id: number): string {
  return seats.find((s) => s.id === id)?.name ?? `player ${id}`;
}
