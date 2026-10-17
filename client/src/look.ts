import { view } from "./config";
import { zoomed } from "./zoom";

/** Where this tab's player is looking. Mouse look needs pointer lock: click the canvas. */
export const look = { yaw: 0, pitch: 0, zoom: 1 }; // zoom scales the survivor camera's distance
// Exposed for the tools/ drivers, which cannot capture the mouse in headless Chrome.
(globalThis as { paleLook?: typeof look }).paleLook = look;

export function initLook(canvas: HTMLCanvasElement) {
  canvas.addEventListener("click", () => {
    // The browser may refuse, e.g. in a tab without focus. The next click asks again.
    if (document.pointerLockElement !== canvas) canvas.requestPointerLock()?.catch(() => {});
  });
  // The mouse wheel moves the survivor camera in or out, within 20% of its default.
  addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      look.zoom = zoomed(look.zoom, e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY);
    },
    { passive: false },
  );
  addEventListener("mousemove", (e) => {
    if (document.pointerLockElement !== canvas) return;
    look.yaw = (look.yaw + e.movementX * view.mouseSensitivity) % (2 * Math.PI);
    const limit = (view.maxPitch * Math.PI) / 180;
    look.pitch = Math.max(-limit, Math.min(limit, look.pitch + e.movementY * view.mouseSensitivity));
  });
}
