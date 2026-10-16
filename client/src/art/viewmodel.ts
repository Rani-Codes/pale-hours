import { AmbientLight, BoxGeometry, DirectionalLight, Group, Mesh, MeshLambertMaterial, Scene, type Camera } from "three";
import { cleaver, type SwingView } from "./characters";
import { snapped } from "./retro";
import { cloth } from "./textures";

/**
 * What the killer sees of himself in first person: a coat sleeve, a fist and
 * the cleaver, low on the right. Drawn as an overlay on a cleared depth
 * buffer, so it never sinks into a wall he stands against.
 */
export class ViewModel {
  readonly scene = new Scene();
  private readonly rig = new Group(); // follows the camera
  private readonly arm = new Group(); // moves within the camera's frame

  constructor() {
    this.scene.add(new AmbientLight(0xffffff, 0.35));
    const key = new DirectionalLight(0xcfd6e6, 0.9);
    key.position.set(1, 2, 1);
    this.scene.add(key);
    const sleeve = new Mesh(new BoxGeometry(0.13, 0.13, 0.5), snapped(new MeshLambertMaterial({ color: 0x2a2422, map: cloth() })));
    sleeve.position.z = 0.22;
    const fist = new Mesh(new BoxGeometry(0.11, 0.11, 0.12), snapped(new MeshLambertMaterial({ color: 0x6a5e56 })));
    // The cleaver model hangs from the hand; turned over it stands up from the fist, edge forward.
    const blade = cleaver();
    blade.rotation.set(Math.PI, 0, 0);
    blade.position.y = 0.05;
    blade.scale.setScalar(1.1);
    this.arm.add(sleeve, fist, blade);
    this.arm.scale.setScalar(0.45);
    this.rig.add(this.arm);
    this.scene.add(this.rig);
  }

  /** Follow the camera and pose the swing. bob is the walk phase, moving 0 to 1. */
  update(eye: Camera, swing: SwingView, bob: number, moving: number) {
    this.rig.position.copy(eye.position);
    this.rig.quaternion.copy(eye.quaternion);
    const ease = (k: number) => k * k * (3 - 2 * k);
    // Rest, raised, and struck-through positions in camera space, with their tilts.
    const rest = { x: 0.24, y: -0.26, z: -0.5, rx: 0.35, rz: -0.2 };
    const raised = { x: 0.3, y: -0.04, z: -0.38, rx: -0.9, rz: -0.7 };
    const struck = { x: -0.22, y: -0.36, z: -0.52, rx: 1.0, rz: 1.0 };
    const mix = (a: typeof rest, b: typeof rest, k: number) =>
      Object.fromEntries(Object.keys(a).map((key) => [key, a[key as keyof typeof rest] + (b[key as keyof typeof rest] - a[key as keyof typeof rest]) * k])) as typeof rest;
    const p =
      swing.stage === "windup" ? mix(rest, raised, ease(swing.k)) : swing.stage === "strike" ? mix(raised, struck, ease(swing.k)) : swing.stage === "recover" ? mix(struck, rest, ease(swing.k)) : rest;
    const b = Math.sin(bob) * 0.018 * moving;
    this.arm.position.set(p.x + b * 0.5, p.y + Math.abs(b), p.z);
    this.arm.rotation.set(p.rx, 0, p.rz);
  }
}
