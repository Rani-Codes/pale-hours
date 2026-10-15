import {
  AmbientLight,
  BoxGeometry,
  CylinderGeometry,
  DirectionalLight,
  Group,
  Mesh,
  MeshLambertMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  WebGLRenderer,
} from "three";
import { view } from "./config";
import type { PaleSim, SimPlayer } from "./sim";

const M = 1_000_000; // micrometers per meter
const WALL_HEIGHT = 3;
const KILLER_HEIGHT = 1.9;
const SURVIVOR_HEIGHT = 1.7;

/**
 * Draws the sim's world in Three.js. The sim's plane is (x, y); here that is
 * Three's (x, -z) with y up, so +y in the sim is "north", away from the camera.
 */
export class Renderer {
  private readonly gl: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly overhead: OrthographicCamera;
  private readonly eye = new PerspectiveCamera(view.survivor.fov, 1, view.near, view.far);
  private readonly bodies = new Map<number, Group>();
  /** Show the whole map from above instead of the player's own view. Toggle with M. */
  showMap = false;
  private readonly killerMat = new MeshLambertMaterial({ color: 0xc0392b });
  private readonly survivorMat = new MeshLambertMaterial({ color: 0xd8d4c8 });

  constructor(
    canvas: HTMLCanvasElement,
    private readonly sim: PaleSim,
  ) {
    this.gl = new WebGLRenderer({ canvas, antialias: false });
    this.gl.setClearColor(0x0b0b0d);

    const half = sim.mapHalfExtent / M;
    this.scene.add(new AmbientLight(0xffffff, 0.8));
    const sun = new DirectionalLight(0xffffff, 1.2);
    sun.position.set(-20, 60, 30);
    this.scene.add(sun);

    const floor = new Mesh(new PlaneGeometry(2 * half, 2 * half), new MeshLambertMaterial({ color: 0x1c1c21 }));
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);

    const wallMat = new MeshLambertMaterial({ color: 0x6b6b73 });
    for (const w of sim.walls) {
      const sx = (w.maxX - w.minX) / M;
      const sz = (w.maxY - w.minY) / M;
      const mesh = new Mesh(new BoxGeometry(sx, WALL_HEIGHT, sz), wallMat);
      mesh.position.set((w.minX + w.maxX) / 2 / M, WALL_HEIGHT / 2, -(w.minY + w.maxY) / 2 / M);
      this.scene.add(mesh);
    }

    this.overhead = new OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    this.overhead.position.set(0, 100, 0);
    this.overhead.up.set(0, 0, -1);
    this.overhead.lookAt(0, 0, 0);
    this.eye.rotation.order = "YXZ";
  }

  /**
   * Draw one frame. self is this tab's player and yaw/pitch (radians) where
   * it looks, straight from the mouse so the view never waits on the network.
   */
  draw(players: SimPlayer[], self: number | undefined, yaw: number, pitch: number): void {
    this.resize();
    const live = new Set<number>();
    for (const p of players) {
      live.add(p.id);
      let body = this.bodies.get(p.id);
      if (!body) {
        body = this.makeBody(p.role === this.sim.roles.killer);
        this.bodies.set(p.id, body);
        this.scene.add(body);
      }
      body.position.set(p.x / M, 0, -p.y / M);
      body.rotation.y = (-p.yaw / 65536) * 2 * Math.PI;
    }
    for (const [id, body] of this.bodies) {
      if (live.has(id)) continue;
      this.scene.remove(body);
      this.bodies.delete(id);
    }

    const me = players.find((p) => p.id === self);
    if (this.showMap || !me) {
      for (const body of this.bodies.values()) body.visible = true;
      this.gl.render(this.scene, this.overhead);
      return;
    }
    // Your own body stays out of your first-person view.
    const killer = me.role === this.sim.roles.killer;
    for (const [id, body] of this.bodies) body.visible = !(killer && id === self);

    const x = me.x / M;
    const z = -me.y / M;
    const fx = Math.sin(yaw);
    const fz = -Math.cos(yaw);
    this.eye.rotation.set(-pitch, -yaw, 0);
    if (killer) {
      this.eye.fov = view.killer.fov;
      this.eye.position.set(x, view.killer.eyeHeight, z);
    } else {
      const { fov, distance, height, shoulder } = view.survivor;
      this.eye.fov = fov;
      // Behind the player, a little to the right so the body does not cover the crosshair.
      this.eye.position.set(x - fx * distance - fz * shoulder, height, z - fz * distance + fx * shoulder);
    }
    this.eye.updateProjectionMatrix();
    this.gl.render(this.scene, this.eye);
  }

  private makeBody(killer: boolean): Group {
    const h = killer ? KILLER_HEIGHT : SURVIVOR_HEIGHT;
    const group = new Group();
    const torso = new Mesh(new CylinderGeometry(0.4, 0.4, h, 12), killer ? this.killerMat : this.survivorMat);
    torso.position.y = h / 2;
    // A nose so you can see which way someone faces. The model art comes later.
    const nose = new Mesh(new BoxGeometry(0.2, 0.2, 0.5), killer ? this.killerMat : this.survivorMat);
    nose.position.set(0, h * 0.8, -0.45);
    group.add(torso, nose);
    return group;
  }

  private resize(): void {
    const dpr = devicePixelRatio;
    const w = Math.floor(innerWidth * dpr);
    const h = Math.floor(innerHeight * dpr);
    const canvas = this.gl.domElement;
    if (canvas.width !== w || canvas.height !== h) {
      this.gl.setSize(innerWidth, innerHeight, false);
      this.gl.setPixelRatio(dpr);
      canvas.width = w;
      canvas.height = h;
    }
    const half = (this.sim.mapHalfExtent / M) * 1.08;
    const aspect = innerWidth / innerHeight;
    const halfH = aspect >= 1 ? half : half / aspect;
    const halfW = halfH * aspect;
    Object.assign(this.overhead, { left: -halfW, right: halfW, top: halfH, bottom: -halfH });
    this.overhead.updateProjectionMatrix();
    this.eye.aspect = aspect;
  }
}
