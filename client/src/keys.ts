import type { Move } from "./inputqueue";

export interface Binding {
  up: string;
  down: string;
  left: string;
  right: string;
}

export const wasd: Binding = { up: "KeyW", down: "KeyS", left: "KeyA", right: "KeyD" };
export const arrows: Binding = { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" };

const held = new Set<string>();
const bound = new Set([wasd, arrows].flatMap((b) => [b.up, b.down, b.left, b.right]));
addEventListener("keydown", (e) => {
  if (bound.has(e.code) && !(e.target instanceof HTMLInputElement)) e.preventDefault();
  held.add(e.code);
});
addEventListener("keyup", (e) => held.delete(e.code));
addEventListener("blur", () => held.clear());

const axis = (negative: string, positive: string) => (held.has(positive) ? 127 : 0) - (held.has(negative) ? 127 : 0);
const clamp = (v: number) => Math.max(-127, Math.min(127, v));

/** Facing in radians to the sim's 1/65536 turns, 0 to 65535. */
export function yawUnits(radians: number): number {
  return Math.round((radians / (2 * Math.PI)) * 65536) & 0xffff;
}

/**
 * Movement relative to where the player faces: W goes forward, D goes right.
 * The sim only knows world directions, so the rotation happens here.
 */
export function readIntent(yawRadians: number, ...bindings: Binding[]) {
  const { moveX: right, moveY: forward } = readMove(...bindings);
  const s = Math.sin(yawRadians);
  const c = Math.cos(yawRadians);
  return {
    moveX: clamp(Math.round(right * c + forward * s)),
    moveY: clamp(Math.round(forward * c - right * s)),
    yaw: yawUnits(yawRadians),
  };
}

/** The combined direction held on any of these bindings. */
export function readMove(...bindings: Binding[]): Omit<Move, "yaw"> {
  let moveX = 0;
  let moveY = 0;
  for (const b of bindings) {
    moveX += axis(b.left, b.right);
    moveY += axis(b.down, b.up);
  }
  return { moveX: clamp(moveX), moveY: clamp(moveY) };
}
