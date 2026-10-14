import type { SimPlayer, SimState } from "./sim";

/**
 * Guest side: snapshots of other players, drawn a fixed delay behind an
 * estimate of the host's clock so there is usually a later snapshot to
 * interpolate toward, even when one is late or lost.
 */
export class SnapshotBuffer {
  private snaps: SimState[] = [];
  private offset: number | undefined; // host tick minus local clock in ticks
  private spread = 0; // mean deviation of arrivals from that clock, in ticks
  private lastRenderTick = -Infinity;
  private tickMs: number;
  private delayTicks: number;
  private smoothing: number;
  /** Frames drawn with no later snapshot to interpolate toward, so remote players froze. */
  starved = 0;

  constructor(tickMs: number, delayMs: number, smoothing: number) {
    this.tickMs = tickMs;
    this.delayTicks = delayMs / tickMs;
    this.smoothing = smoothing;
  }

  push(state: SimState, nowMs: number) {
    const sample = state.tick - nowMs / this.tickMs;
    if (this.offset === undefined) this.offset = sample;
    this.spread += (Math.abs(sample - this.offset) - this.spread) * this.smoothing;
    this.offset += (sample - this.offset) * this.smoothing;

    if (this.snaps.length > 0 && state.tick <= this.snaps[0].tick) return;
    let i = this.snaps.length;
    while (i > 0 && this.snaps[i - 1].tick > state.tick) i--;
    if (this.snaps[i - 1]?.tick === state.tick) return;
    this.snaps.splice(i, 0, state);
  }

  /**
   * The host tick being drawn right now. Never goes backwards. Arrivals
   * scatter around the clock estimate, so the delay grows by twice that
   * scatter; otherwise any late snapshot after a lost one leaves nothing to draw toward.
   */
  renderTick(nowMs: number): number {
    if (this.offset === undefined) return -Infinity;
    const t = nowMs / this.tickMs + this.offset - this.delayTicks - 2 * this.spread;
    this.lastRenderTick = Math.max(this.lastRenderTick, t);
    return this.lastRenderTick;
  }

  /** Every player as of renderTick, interpolated between the snapshots around it. */
  sample(nowMs: number): SimPlayer[] {
    const t = this.renderTick(nowMs);
    while (this.snaps.length >= 2 && this.snaps[1].tick <= t) this.snaps.shift();
    const [a, b] = this.snaps;
    if (!a) return [];
    if (!b && t > a.tick) this.starved++;
    if (!b || t <= a.tick) return a.players;
    const alpha = (t - a.tick) / (b.tick - a.tick);
    return b.players.map((p) => {
      const from = a.players.find((q) => q.id === p.id) ?? p;
      return { ...p, x: from.x + (p.x - from.x) * alpha, y: from.y + (p.y - from.y) * alpha };
    });
  }
}
