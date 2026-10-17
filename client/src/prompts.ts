import type { PaleSim, SimPlayer } from "./sim";

type Rules = Pick<
  PaleSim,
  "health" | "tickRate" | "hookTicks" | "hookSites" | "hookRange" | "rescueTicks" | "rescueRange" | "reviveRange" | "pickupRange" | "recoverTicks" | "hookCheckPenalty" | "hookEscapeChance" | "hookEscapeTries" | "roles"
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
const triesLeft = (p: SimPlayer, rules: Rules) => Math.max(0, rules.hookEscapeTries - p.hookTries);
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
  if (me.carried) return [`you are being carried: press E then Q, again and again, to wriggle free. ${secondsLeft(me.recover, rules)} s left`];
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
  if (me.freeze) return [`the hunt begins in ${Math.ceil(me.freeze / rules.tickRate)} s`];
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

type GenWorld = Pick<PaleSim, "genSites" | "repairRange" | "genTicks" | "maxRepairers">;

/** The nearest unfinished generator within reach of p, or -1. */
function generatorAt(p: { x: number; y: number }, gens: number[], world: Pick<PaleSim, "genSites" | "repairRange" | "genTicks">): number {
  let best = -1;
  world.genSites.forEach((s, i) => {
    const d = dist(s, p);
    if (d <= world.repairRange && gens[i] < world.genTicks && (best < 0 || d < dist(world.genSites[best], p))) best = i;
  });
  return best;
}

/** How many survivors are repairing the generator at index i. */
function crewAt(i: number, players: SimPlayer[], gens: number[], world: GenWorld): number {
  return players.filter((q) => q.repairing && generatorAt(q, gens, world) === i).length;
}

/**
 * How far along the generator a repairing survivor stands beside is, and how
 * many are on it: each one adds their own work, so two are twice as fast.
 * "" when they are not repairing one.
 */
export function repairLine(me: SimPlayer, players: SimPlayer[], gens: number[], world: GenWorld): string {
  if (!me.repairing || me.opening || me.helping || me.onHook) return "";
  const best = generatorAt(me, gens, world);
  if (best < 0) return "";
  const crew = crewAt(best, players, gens, world);
  return `generator ${pct(gens[best], world.genTicks)}` + (crew > 1 ? `, ${crew} working: ${crew}x speed` : "");
}

/** What a survivor beside a generator that already has a full crew is told, or "". */
export function fullGeneratorPrompt(me: SimPlayer, players: SimPlayer[], gens: number[], world: GenWorld): string {
  if (me.repairing) return "";
  const i = generatorAt(me, gens, world);
  return i >= 0 && crewAt(i, players, gens, world) >= world.maxRepairers ? `this generator already has ${world.maxRepairers} survivors working` : "";
}

const distToBox = (p: { x: number; y: number }, b: { minX: number; minY: number; maxX: number; maxY: number }) =>
  Math.hypot(Math.max(b.minX - p.x, 0, p.x - b.maxX), Math.max(b.minY - p.y, 0, p.y - b.maxY));

/**
 * The pallet prompt for whoever is beside one: a survivor next to a standing
 * pallet is told to throw it down; the killer next to a dropped one, empty
 * handed and on his feet, is told to break it and then how long is left.
 * states and breaks are World.pallets and World.palletBreak.
 */
export function palletPrompt(
  me: SimPlayer,
  states: number[],
  breaks: number[],
  rules: Pick<PaleSim, "palletSites" | "palletReach" | "palletBreakReach" | "palletBreakTicks" | "tickRate" | "roles" | "health">,
): string {
  const killer = me.role === rules.roles.killer;
  if (killer ? me.carrying || me.stun : me.health === rules.health.downed || me.carried || me.onHook || me.checkActive || me.escaped || me.eliminated) return "";
  for (const [i, box] of rules.palletSites.entries()) {
    if (killer && states[i] === 1 && distToBox(me, box) <= rules.palletBreakReach) {
      const left = Math.ceil((rules.palletBreakTicks - (breaks[i] ?? 0)) / rules.tickRate);
      return breaks[i] ? `breaking the pallet: ${left} s` : "hold E to break the pallet";
    }
    if (!killer && states[i] === 0 && distToBox(me, box) <= rules.palletReach) return "Space to throw down the pallet";
  }
  return "";
}

/**
 * The panel a hooked survivor sees to wriggle off: what to press, the odds, and
 * a pip for each try they have left. undefined when they are not hooked.
 */
export function hookEscapeView(me: SimPlayer, rules: Rules): { title: string; odds: string; pips: boolean[] } | undefined {
  if (!me.onHook || me.eliminated) return undefined;
  const left = triesLeft(me, rules);
  const pips = Array.from({ length: rules.hookEscapeTries }, (_, i) => i < left);
  return left > 0
    ? { title: "press E to wriggle off the hook", odds: `${rules.hookEscapeChance}% a try`, pips }
    : { title: "no tries left: hold on for a teammate", odds: "", pips };
}
