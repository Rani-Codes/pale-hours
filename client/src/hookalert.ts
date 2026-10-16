import type { SimPlayer } from "./sim";

/** A teammate's hook to point out: whose, which hook site (index), and 1 fading to 0 as the alert ends. */
export interface HookAlert {
  id: number;
  hook: number;
  left: number;
}

/**
 * When a survivor is hung on a hook, every other survivor sees where for a
 * few seconds so they can come for them. The hook itself is sim state every
 * peer already has; this only notices when it changes.
 */
export class HookAlerts {
  /** When each hooked survivor was first seen on their current hook. */
  private readonly since = new Map<number, { hook: number; at: number }>();

  private readonly showMs: number;
  private readonly survivor: number;

  constructor(showMs: number, roles: { survivor: number }) {
    this.showMs = showMs;
    this.survivor = roles.survivor;
  }

  update(players: SimPlayer[], self: number | undefined, nowMs: number): HookAlert[] {
    for (const p of players) {
      if (!p.onHook || p.eliminated) this.since.delete(p.id);
      else if (this.since.get(p.id)?.hook !== p.onHook) this.since.set(p.id, { hook: p.onHook, at: nowMs });
    }
    const me = players.find((p) => p.id === self);
    if (!me || me.role !== this.survivor) return [];
    const out: HookAlert[] = [];
    for (const [id, { hook, at }] of this.since) {
      const age = nowMs - at;
      if (id !== self && age < this.showMs) out.push({ id, hook: hook - 1, left: 1 - age / this.showMs });
    }
    return out;
  }
}
