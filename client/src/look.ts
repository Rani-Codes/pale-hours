import { view } from "./config";

/** Where this tab's player is looking. Mouse look needs pointer lock: click the canvas. */
export const look = { yaw: 0, pitch: 0 };

export function initLook(canvas: HTMLCanvasElement) {
  canvas.addEventListener("click", () => {
    if (document.pointerLockElement !== canvas) void canvas.requestPointerLock();
  });
  addEventListener("mousemove", (e) => {
    if (document.pointerLockElement !== canvas) return;
    look.yaw = (look.yaw + e.movementX * view.mouseSensitivity) % (2 * Math.PI);
    const limit = (view.maxPitch * Math.PI) / 180;
    look.pitch = Math.max(-limit, Math.min(limit, look.pitch + e.movementY * view.mouseSensitivity));
  });
}
