/** The survivor camera can sit this much nearer or farther than its default distance. */
export const ZOOM_MIN = 0.8;
export const ZOOM_MAX = 1.2;

/** The zoom after a wheel turn of deltaY: down pulls the camera back, up brings it in. */
export function zoomed(current: number, deltaY: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, current + deltaY * 0.0008));
}
