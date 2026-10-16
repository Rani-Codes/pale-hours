/**
 * The lobby's rules, kept pure so they are easy to test. The host owns the
 * seat list and applies every pick; guests only ask.
 */

export type Role = "killer" | "survivor";

/** One player in the room. Their role is unset until they pick. */
export interface Seat {
  id: number;
  role?: Role;
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
