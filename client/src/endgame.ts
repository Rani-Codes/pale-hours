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

/**
 * The end screen: a headline for this tab's player, then how each survivor
 * finished. Each survivor wins or loses on their own; the killer's result
 * is how many he killed.
 */
export function results(me: SimPlayer | undefined, players: SimPlayer[], rules: Roles): { headline: string; lines: string[] } {
  const survivors = players.filter((p) => p.role === rules.roles.survivor);
  const killed = survivors.filter((p) => p.eliminated).length;
  const lines = survivors.map((p) => `survivor ${p.id}: ${p.escaped ? "escaped" : "killed"}`);
  if (me?.role === rules.roles.killer) {
    const headline = killed === survivors.length ? "You killed them all" : killed === 0 ? "They all escaped" : `You killed ${killed} of ${survivors.length}`;
    return { headline, lines };
  }
  return { headline: me?.escaped ? "You escaped" : me?.eliminated ? "You died" : "Match over", lines };
}
