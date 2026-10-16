export interface HeartbeatConfig {
  range: number;
  minBpm: number;
  maxBpm: number;
  minGain: number;
  maxGain: number;
  /** Pitch of the first and second thump, Hz. Lower is more bass. */
  lubHz: number;
  dubHz: number;
  attack: number; // seconds
  decay: number; // seconds
  lowpassHz: number; // rounds off the top of the thump
}

export interface GeneratorDoneConfig {
  gain: number;
  chugs: number;
  firstChugMs: number;
  chugSpeedup: number;
  idleHz: number;
  rattleHz: number;
  idleSec: number;
}

export interface Beat {
  bpm: number;
  gain: number;
}

/**
 * How the heartbeat sounds at a distance from the killer in meters: silent
 * beyond audio.heartbeat.range, then rising to the fastest, loudest beat
 * when he is on top of you. The curve is squared so it stays calm until he
 * is close, then climbs quickly.
 */
export function beatAt(distanceM: number, h: HeartbeatConfig): Beat {
  if (!(distanceM < h.range)) return { bpm: 0, gain: 0 };
  const closeness = 1 - Math.max(0, distanceM) / h.range;
  const t = closeness * closeness;
  return { bpm: h.minBpm + (h.maxBpm - h.minBpm) * t, gain: h.minGain + (h.maxGain - h.minGain) * t };
}

/** Synthesized lub-dub, so there are no audio assets to license. Needs a user gesture to start. */
export class Heartbeat {
  private readonly config: HeartbeatConfig;
  private ctx: AudioContext | undefined;
  private master: GainNode | undefined;
  private bus: BiquadFilterNode | undefined;
  private volume = 1;
  private nextAt = 0;
  /** What is playing right now, for drivers and the HUD. */
  current: Beat = { bpm: 0, gain: 0 };

  private readonly done: GeneratorDoneConfig;

  constructor(config: HeartbeatConfig, done: GeneratorDoneConfig) {
    this.config = config;
    this.done = done;
  }

  /** A generator finished: an engine cranks over, catches with a clank, and runs on in a rattling idle. Heard at full strength wherever you are. */
  generatorDone() {
    const { ctx, master } = this;
    if (!ctx || !master || ctx.state !== "running") return;
    const d = this.done;
    const out = ctx.createGain();
    out.gain.value = d.gain;
    const dull = ctx.createBiquadFilter(); // keeps it a heavy machine, not a buzz
    dull.type = "lowpass";
    dull.frequency.value = 320;
    dull.connect(out).connect(master);

    const t0 = ctx.currentTime + 0.02;
    let at = t0;
    let gap = d.firstChugMs / 1000;
    for (let k = 0; k < d.chugs; k++) {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(34 + k * 4, at);
      osc.frequency.linearRampToValueAtTime(52 + k * 4, at + 0.12);
      env.gain.setValueAtTime(0, at);
      env.gain.linearRampToValueAtTime(0.7, at + 0.01);
      env.gain.exponentialRampToValueAtTime(0.001, at + 0.16);
      osc.connect(env).connect(dull);
      osc.start(at);
      osc.stop(at + 0.2);
      at += gap;
      gap *= d.chugSpeedup;
    }

    // It catches: a metal clank, then the idle, shuddering and dying away.
    const noise = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.12), ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const clank = ctx.createBufferSource();
    const ring = ctx.createBiquadFilter();
    const clankEnv = ctx.createGain();
    clank.buffer = noise;
    ring.type = "bandpass";
    ring.frequency.value = 1100;
    ring.Q.value = 6;
    clankEnv.gain.setValueAtTime(0.5, at);
    clankEnv.gain.exponentialRampToValueAtTime(0.001, at + 0.12);
    clank.connect(ring).connect(clankEnv).connect(out);
    clank.start(at);

    const idle = ctx.createOscillator();
    const level = ctx.createGain();
    const shudder = ctx.createOscillator();
    const depth = ctx.createGain();
    idle.type = "sawtooth";
    idle.frequency.setValueAtTime(d.idleHz * 1.5, at);
    idle.frequency.exponentialRampToValueAtTime(d.idleHz, at + 0.35);
    level.gain.setValueAtTime(0.0, at);
    level.gain.linearRampToValueAtTime(0.5, at + 0.04);
    level.gain.setValueAtTime(0.5, at + d.idleSec * 0.55);
    level.gain.exponentialRampToValueAtTime(0.001, at + d.idleSec);
    shudder.type = "square";
    shudder.frequency.value = d.rattleHz;
    depth.gain.value = 0.22; // the idle's level swings by this much, 15 times a second
    shudder.connect(depth).connect(level.gain);
    idle.connect(level).connect(dull);
    idle.start(at);
    shudder.start(at);
    idle.stop(at + d.idleSec + 0.05);
    shudder.stop(at + d.idleSec + 0.05);
  }

  /** Master volume, 0 to 1. Applies to every sound the game makes. */
  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    // Loudness is perceived on a curve, so a straight gain makes the top half of a slider do almost nothing.
    if (this.master) this.master.gain.value = this.volume ** 2;
  }

  /** The master volume in effect, 0 to 1. */
  get level(): number {
    return this.volume;
  }

  /** True once the browser has let the audio context start. */
  get running(): boolean {
    return this.ctx?.state === "running";
  }

  /** Call from a click or key press: browsers keep audio locked until then. */
  unlock() {
    try {
      this.ctx ??= new AudioContext();
      if (!this.master) {
        this.master = this.ctx.createGain();
        this.master.gain.value = this.volume ** 2;
        this.master.connect(this.ctx.destination);
        // Round off the harsh top end so it reads as muffled, like a heart through a wall.
        this.bus = this.ctx.createBiquadFilter();
        this.bus.type = "lowpass";
        this.bus.frequency.value = this.config.lowpassHz;
        this.bus.Q.value = 0.5;
        this.bus.connect(this.master);
      }
      void this.ctx.resume();
    } catch {
      // No audio device. The game stays playable without the heartbeat.
    }
  }

  /** Call every frame with the distance to the killer, or undefined when there is none to hear. */
  update(distanceM: number | undefined) {
    this.current = distanceM === undefined ? { bpm: 0, gain: 0 } : beatAt(distanceM, this.config);
    const { ctx, master } = this;
    if (!ctx || !master || ctx.state !== "running") return;
    const { bpm, gain } = this.current;
    if (bpm === 0) {
      this.nextAt = 0;
      return;
    }
    const now = ctx.currentTime;
    if (this.nextAt < now) this.nextAt = now + 0.05;
    while (this.nextAt < now + 0.15) {
      this.thump(this.nextAt, gain, this.config.lubHz);
      this.thump(this.nextAt + 0.24, gain * 0.7, this.config.dubHz);
      this.nextAt += 60 / bpm;
    }
  }

  private thump(at: number, gain: number, hz: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    // A short soft thud with no pitch sweep, so there is no click and no long bass tail.
    osc.type = "triangle";
    osc.frequency.value = hz;
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(gain, at + this.config.attack);
    env.gain.exponentialRampToValueAtTime(0.001, at + this.config.attack + this.config.decay);
    osc.connect(env).connect(this.bus!);
    osc.start(at);
    osc.stop(at + this.config.attack + this.config.decay + 0.05);
  }
}
