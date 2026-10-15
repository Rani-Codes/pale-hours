import {
  AmbientLight,
  BoxGeometry,
  CylinderGeometry,
  DirectionalLight,
  Mesh,
  MeshLambertMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  WebGLRenderer,
} from "three";
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
  private readonly camera: OrthographicCamera;
  private readonly bodies = new Map<number, Mesh>();
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

    // Overhead for now. The first-person and third-person cameras replace it.
    this.camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    this.camera.position.set(0, 100, 0);
    this.camera.up.set(0, 0, -1);
    this.camera.lookAt(0, 0, 0);
  }

  draw(players: SimPlayer[]): void {
    this.resize();
    const live = new Set<number>();
    for (const p of players) {
      live.add(p.id);
      let body = this.bodies.get(p.id);
      if (!body) {
        const killer = p.role === this.sim.roles.killer;
        const h = killer ? KILLER_HEIGHT : SURVIVOR_HEIGHT;
        body = new Mesh(new CylinderGeometry(0.4, 0.4, h, 12), killer ? this.killerMat : this.survivorMat);
        this.bodies.set(p.id, body);
        this.scene.add(body);
      }
      const h = (body.geometry as CylinderGeometry).parameters.height;
      body.position.set(p.x / M, h / 2, -p.y / M);
    }
    for (const [id, body] of this.bodies) {
      if (live.has(id)) continue;
      this.scene.remove(body);
      body.geometry.dispose();
      this.bodies.delete(id);
    }
    this.gl.render(this.scene, this.camera);
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
    Object.assign(this.camera, { left: -halfW, right: halfW, top: halfH, bottom: -halfH });
    this.camera.updateProjectionMatrix();
  }
}
