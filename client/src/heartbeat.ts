export interface HeartbeatConfig {
  range: number;
  minBpm: number;
  maxBpm: number;
  minGain: number;
  maxGain: number;
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
  private nextAt = 0;
  /** What is playing right now, for drivers and the HUD. */
  current: Beat = { bpm: 0, gain: 0 };

  constructor(config: HeartbeatConfig) {
    this.config = config;
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
        this.master.connect(this.ctx.destination);
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
      this.thump(this.nextAt, gain, 62);
      this.thump(this.nextAt + 0.2, gain * 0.7, 50);
      this.nextAt += 60 / bpm;
    }
  }

  private thump(at: number, gain: number, hz: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.frequency.setValueAtTime(hz * 1.6, at);
    osc.frequency.exponentialRampToValueAtTime(hz, at + 0.06);
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(gain, at + 0.015);
    env.gain.exponentialRampToValueAtTime(0.001, at + 0.16);
    osc.connect(env).connect(this.master!);
    osc.start(at);
    osc.stop(at + 0.2);
  }
}
