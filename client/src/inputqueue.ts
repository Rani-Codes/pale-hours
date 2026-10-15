import type { InputFrame } from "./protocol";

export interface QueueLimits {
  backlogWindowTicks: number;
  /** Spare inputs (beyond the one due this tick) the queue may hold for a whole window before it drops one. */
  backlogSpare: number;
  maxQueued: number;
}

export interface Move {
  moveX: number;
  moveY: number;
  yaw: number;
  act: boolean;
  skill: boolean;
}

/**
 * Host side: one guest's inputs, applied one per host tick in seq order.
 *
 * When the next input has not arrived, the guest stands still for that tick
 * and the input is applied late rather than skipped, so the host ends up
 * where the guest predicted and the guest never sees a correction. Each such
 * stall leaves one extra input queued, which acts as a jitter buffer. The
 * queue drains that buffer one input at a time when it has held spare inputs
 * for a whole window, so a burst of lag does not delay this guest forever.
 */
export class InputQueue {
  private queued = new Map<number, Move>();
  private next = 1;
  private lastYaw = 0;
  private windowMin = Infinity;
  private windowTicks = 0;
  /** Inputs dropped by the host. Each one shows up as a correction on the guest. */
  dropped = 0;

  private limits: QueueLimits;

  constructor(limits: QueueLimits) {
    this.limits = limits;
  }

  /** The last seq applied or dropped. Sent back to the guest in snapshots. */
  get ack(): number {
    return this.next - 1;
  }

  get depth(): number {
    return this.queued.size;
  }

  push(frames: InputFrame[]) {
    for (const f of frames) {
      if (f.seq >= this.next && f.seq < this.next + 2 * this.limits.maxQueued) {
        this.queued.set(f.seq, { moveX: f.moveX, moveY: f.moveY, yaw: f.yaw, act: f.act, skill: f.skill });
      }
    }
    while (this.queued.size > this.limits.maxQueued) this.dropOldest();
  }

  /** The input to apply this tick. */
  take(): Move {
    this.drainSpare();
    if (!this.queued.has(this.next)) {
      // The guest gave up on inputs it held too long, so they will never come.
      const oldest = this.oldest();
      if (oldest === undefined) return { moveX: 0, moveY: 0, yaw: this.lastYaw, act: false, skill: false };
      this.next = oldest;
    }
    const move = this.queued.get(this.next)!;
    this.lastYaw = move.yaw;
    this.queued.delete(this.next++);
    return move;
  }

  private drainSpare() {
    this.windowMin = Math.min(this.windowMin, this.queued.size);
    if (++this.windowTicks < this.limits.backlogWindowTicks) return;
    if (this.windowMin - 1 > this.limits.backlogSpare) this.dropOldest();
    this.windowMin = Infinity;
    this.windowTicks = 0;
  }

  private dropOldest() {
    const oldest = this.oldest();
    if (oldest === undefined) return;
    this.queued.delete(oldest);
    this.next = Math.max(this.next, oldest + 1);
    this.dropped++;
  }

  private oldest(): number | undefined {
    let min: number | undefined;
    for (const seq of this.queued.keys()) if (min === undefined || seq < min) min = seq;
    return min;
  }
}
