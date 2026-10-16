import type { SimPlayer } from "./sim";

type Roles = { roles: { survivor: number; killer: number } };

/** Out of play: escaped or died. Their tab spectates. */
export const isOut = (p: SimPlayer) => p.escaped || p.eliminated;

/**
 * Who a spectator watches: the pick-th player still in play, wrapping, or
 * undefined when nobody is. Survivors come first, then the killer.
 */
export function spectateTarget(players: SimPlayer[], pick: number, rules: Roles): SimPlayer | undefined {
  const live = players.filter((p) => !isOut(p)).sort((a, b) => Number(a.role === rules.roles.killer) - Number(b.role === rules.roles.killer) || a.id - b.id);
  return live.length ? live[((pick % live.length) + live.length) % live.length] : undefined;
}

/** Whether this survivor hears the killer's heartbeat. Not when they can do nothing about it. */
export const hearsHeartbeat = (me: SimPlayer) => !me.carried && !me.onHook && !isOut(me);

/** The match is a win for the survivors when half of them or more got out. */
export function survivorsWin(players: SimPlayer[], rules: Roles): boolean {
  const survivors = players.filter((p) => p.role === rules.roles.survivor);
  return survivors.length > 0 && survivors.filter((p) => p.escaped).length * 2 >= survivors.length;
}

/**
 * The end screen: who won, a line for this tab's player, then how each
 * survivor finished. The killer's line is how many he killed.
 */
export function results(me: SimPlayer | undefined, players: SimPlayer[], rules: Roles, nameOf: (id: number) => string): { headline: string; you: string; lines: string[] } {
  const survivors = players.filter((p) => p.role === rules.roles.survivor);
  const killed = survivors.filter((p) => p.eliminated).length;
  const lines = survivors.map((p) => `${nameOf(p.id)}: ${p.escaped ? "escaped" : "killed"}`);
  const headline = survivorsWin(players, rules) ? "Game over: the survivors win" : "Game over: the killer wins";
  if (me?.role === rules.roles.killer) {
    const you = killed === survivors.length ? "You killed them all" : killed === 0 ? "They all escaped" : `You killed ${killed} of ${survivors.length}`;
    return { headline, you, lines };
  }
  return { headline, you: me?.escaped ? "You escaped" : me?.eliminated ? "You died" : "", lines };
}

export interface Exit {
  id: number;
  how: "escaped" | "died";
}

/**
 * Survivors who got out since the last call, for the room to be told. known
 * remembers what each player looked like last time; a player seen for the
 * first time, or put back by a rematch, announces nothing.
 */
export function newExits(known: Map<number, "in" | "escaped" | "died">, players: SimPlayer[], rules: Roles): Exit[] {
  const out: Exit[] = [];
  for (const p of players) {
    if (p.role !== rules.roles.survivor) continue;
    const now = p.escaped ? "escaped" : p.eliminated ? "died" : "in";
    if (known.get(p.id) === "in" && now !== "in") out.push({ id: p.id, how: now });
    known.set(p.id, now);
  }
  return out;
}
