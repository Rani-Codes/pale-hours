import type { PaleSim, SimPlayer } from "./sim";

type Rules = Pick<
  PaleSim,
  "health" | "tickRate" | "hookTicks" | "hookSites" | "hookRange" | "rescueTicks" | "rescueRange" | "reviveRange" | "pickupRange" | "recoverTicks" | "hookCheckPenalty" | "roles"
>;

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const pct = (n: number, of: number) => `${Math.floor((100 * Math.min(n, of)) / of)}%`;

/** Filled squares on a survivor's health bar: two healthy, one injured, none when down, carried or hooked. */
export function healthPips(p: SimPlayer, rules: Rules): number {
  if (p.escaped || p.eliminated) return 0;
  return p.health === rules.health.healthy ? 2 : p.health === rules.health.injured ? 1 : 0;
}

/** One word or so on how a survivor is doing, for the player list. */
export function status(p: SimPlayer, rules: Rules): string {
  if (p.escaped) return "escaped";
  if (p.eliminated) return "eliminated";
  if (p.onHook) return `on hook, ${hookLeft(p, rules)} s left`;
  if (p.carried) return "carried";
  return ["healthy", "injured", "downed"][p.health] ?? "";
}

const secondsLeft = (recover: number, rules: Rules) => Math.ceil((rules.recoverTicks - recover) / rules.tickRate);
const hookLeft = (p: SimPlayer, rules: Rules) => Math.ceil((rules.hookTicks - p.hookUsed) / rules.tickRate);

/** What a survivor is going through and what they can do about it. */
export function survivorPrompts(me: SimPlayer, players: SimPlayer[], rules: Rules, canVault = false): string[] {
  if (me.escaped) return ["you escaped"];
  if (me.eliminated) return ["you died on the hook"];
  if (me.onHook) {
    return [
      `on the hook: ${hookLeft(me, rules)} s left. A teammate can hold E beside you to free you` + (me.rescue ? ` (${pct(me.rescue, rules.rescueTicks)})` : ""),
      `press Space on each skill check: a miss costs ${rules.hookCheckPenalty / rules.tickRate} s`,
    ];
  }
  if (me.carried) return [`you are being carried: breaking free in ${secondsLeft(me.recover, rules)} s`];
  const lines: string[] = [];
  if (me.health === rules.health.downed) {
    const helper = players.some((p) => p.helping === me.id);
    lines.push(helper ? "a teammate is getting you up" : `you are down: crawl away and hide. Getting up on your own in ${secondsLeft(me.recover, rules)} s`);
    return lines;
  }
  if (me.helping) return ["helping them up: hit the skill check"];
  const teammates = players.filter((p) => p.id !== me.id && p.role === rules.roles.survivor);
  const hooked = teammates.find((p) => p.onHook && !p.eliminated && dist(rules.hookSites[p.onHook - 1], me) <= rules.rescueRange);
  if (hooked) return [hooked.rescue ? `unhooking ${pct(hooked.rescue, rules.rescueTicks)}` : "hold E to unhook them"];
  const downed = teammates.find((p) => p.health === rules.health.downed && !p.carried && !p.onHook && !p.eliminated && !p.escaped && dist(p, me) <= rules.reviveRange);
  if (downed) return ["hold E to help them up"];
  if (canVault && !me.checkActive && !me.vaultTicks) return ["Space to vault"];
  return lines;
}

/** The killer's carry and hook prompts. */
export function killerPrompts(me: SimPlayer, players: SimPlayer[], rules: Rules): string[] {
  if (me.stun) return ["STUNNED"];
  if (me.carrying) {
    const v = players.find((p) => p.id === me.carrying);
    const freeIn = v ? ` They break free in ${secondsLeft(v.recover, rules)} s.` : "";
    const taken = new Set(players.map((p) => p.onHook).filter(Boolean));
    const hook = rules.hookSites.some((h, i) => !taken.has(i + 1) && dist(h, me) <= rules.hookRange);
    return [(hook ? "press E to hang them on the hook." : "carrying: find a hook, or press E to drop them.") + freeIn];
  }
  const downed = players.some(
    (p) => p.role === rules.roles.survivor && p.health === rules.health.downed && !p.carried && !p.onHook && !p.eliminated && !p.escaped && dist(p, me) <= rules.pickupRange,
  );
  return downed ? ["press E to pick them up"] : [];
}

/** The big banner for the killer once a survivor is on his shoulder, or "" when his arms are empty. */
export function carryBanner(me: SimPlayer, nameOf: (id: number) => string): string {
  return me.carrying ? `${nameOf(me.carrying)} is on your shoulder` : "";
}

/** How far along the generator a repairing survivor stands beside is, or "" when they are not repairing one. */
export function repairLine(me: SimPlayer, gens: number[], world: Pick<PaleSim, "genSites" | "repairRange" | "genTicks">): string {
  if (!me.repairing || me.opening || me.helping || me.onHook) return "";
  let best = -1;
  world.genSites.forEach((s, i) => {
    const d = dist(s, me);
    if (d <= world.repairRange && (best < 0 || d < dist(world.genSites[best], me))) best = i;
  });
  return best < 0 ? "" : `generator ${pct(gens[best], world.genTicks)}`;
}
