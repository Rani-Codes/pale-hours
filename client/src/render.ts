import {
  AmbientLight,
  BoxGeometry,
  CylinderGeometry,
  DirectionalLight,
  Fog,
  Group,
  Mesh,
  MeshLambertMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  PointLight,
  Scene,
  WebGLRenderer,
} from "three";
import { view } from "./config";
import { RetroPass, snapped } from "./art/retro";
import { floor, GateModel, GeneratorModel, hookModel, noiseBeam, wall } from "./art/world";
import type { PaleSim, SimPlayer, World } from "./sim";

const M = 1_000_000; // micrometers per meter
const WALL_HEIGHT = 3;
const KILLER_HEIGHT = 1.9;
const SURVIVOR_HEIGHT = 1.7;
const gone = (p: SimPlayer | undefined) => !p || p.escaped || p.eliminated;

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
  private readonly ambient = new AmbientLight(0xffffff, 0.8);
  private readonly sun = new DirectionalLight(0xffffff, 1.2);
  /** A dim light that travels with the viewer, so nearby walls glow out of the dark. */
  private readonly lantern = new PointLight(view.light.lanternColor, view.light.lantern, view.light.lanternRange, 1.5);
  private readonly retro = new RetroPass(view.retro);
  private readonly gens: GeneratorModel[] = [];
  private readonly beams: Mesh[] = [];
  private readonly gates: GateModel[] = [];
  private lastFrame = performance.now();
  private readonly killerMat = snapped(new MeshLambertMaterial({ color: 0xc0392b }));
  private readonly survivorMat = snapped(new MeshLambertMaterial({ color: 0xd8d4c8 }));
  private readonly injuredMat = snapped(new MeshLambertMaterial({ color: 0xa8514a }));

  constructor(
    canvas: HTMLCanvasElement,
    private readonly sim: PaleSim,
  ) {
    this.gl = new WebGLRenderer({ canvas, antialias: false });
    this.gl.setClearColor(view.fog.color);

    const half = sim.mapHalfExtent / M;
    this.scene.add(this.ambient, this.sun, this.lantern);
    this.sun.position.set(-20, 60, 30);

    this.scene.add(floor(half));
    for (const w of sim.walls) {
      const mesh = wall((w.maxX - w.minX) / M, WALL_HEIGHT, (w.maxY - w.minY) / M);
      mesh.position.set((w.minX + w.maxX) / 2 / M, 0, -(w.minY + w.maxY) / 2 / M);
      this.scene.add(mesh);
    }
    for (const site of sim.genSites) {
      const gen = new GeneratorModel(sim.generatorHalf / M);
      gen.object.position.set(site.x / M, 0, -site.y / M);
      this.gens.push(gen);
      // A missed skill check lights a beam over its generator. Only the killer
      // sees it, through walls and fog, for a moment.
      const beam = noiseBeam();
      beam.position.set(site.x / M, beam.position.y, -site.y / M);
      this.beams.push(beam);
      this.scene.add(gen.object, beam);
    }
    for (const site of sim.gateSites) {
      const gate = new GateModel(sim.gateRange / M);
      gate.object.position.set(site.x / M, 0, -site.y / M);
      this.gates.push(gate);
      this.scene.add(gate.object);
    }
    for (const site of sim.hookSites) {
      const hook = hookModel();
      hook.position.set(site.x / M, 0, -site.y / M);
      this.scene.add(hook);
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
  draw(players: SimPlayer[], world: World, self: number | undefined, yaw: number, pitch: number): void {
    this.resize();
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    const { gens, noise, gates } = world;
    this.gens.forEach((g, i) => g.update(gens[i] ?? 0, this.sim.genTicks, dt, now / 1000));
    const powered = gens.filter((g) => g >= this.sim.genTicks).length >= this.sim.gensRequired;
    this.gates.forEach((g, i) => g.update(Math.min(1, (gates[i] ?? 0) / this.sim.gateTicks), powered));
    const live = new Set<number>();
    for (const p of players) {
      live.add(p.id);
      let body = this.bodies.get(p.id);
      if (!body) {
        body = this.makeBody(p.role === this.sim.roles.killer);
        this.bodies.set(p.id, body);
        this.scene.add(body);
      }
      body.visible = !gone(p);
      body.position.set(p.x / M, 0, -p.y / M);
      body.rotation.y = (-p.yaw / 65536) * 2 * Math.PI;
      this.pose(body, p);
    }
    for (const [id, body] of this.bodies) {
      if (live.has(id)) continue;
      this.scene.remove(body);
      this.bodies.delete(id);
    }

    const me = players.find((p) => p.id === self);
    const mapLook = this.showMap || !me;
    this.ambient.intensity = mapLook ? 0.8 : view.light.ambient;
    this.sun.intensity = mapLook ? 1.2 : view.light.moon;
    this.lantern.visible = !mapLook;
    this.scene.fog = mapLook ? null : new Fog(view.fog.color, view.fog.near, view.fog.far);
    this.gl.setClearColor(mapLook ? 0x0b0b0d : view.fog.color);
    if (mapLook || !me) {
      for (const [id, body] of this.bodies) body.visible = !gone(players.find((p) => p.id === id));
      this.beams.forEach((b, i) => (b.visible = (noise[i] ?? 0) > 0));
      this.gl.render(this.scene, this.overhead);
      return;
    }
    // Your own body stays out of your first-person view.
    const killer = me.role === this.sim.roles.killer;
    for (const [id, body] of this.bodies) {
      const p = players.find((q) => q.id === id);
      // The killer's own body, and whoever he carries, would sit inside his camera.
      body.visible = !(killer && (id === self || p?.carried)) && !gone(p);
    }
    this.beams.forEach((b, i) => (b.visible = killer && (noise[i] ?? 0) > 0));

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
    this.lantern.position.copy(this.eye.position);
    this.eye.updateProjectionMatrix();
    this.retro.render(this.gl, this.scene, this.eye);
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
    if (killer) {
      // The weapon arm: it pivots at the shoulder, raised during the windup so survivors can read the swing.
      const arm = new Group();
      arm.name = "arm";
      arm.position.set(0.45, h * 0.78, 0);
      const blade = new Mesh(new BoxGeometry(0.12, 0.12, 1.1), this.killerMat);
      blade.position.z = -0.55;
      arm.add(blade);
      group.add(arm);
    }
    return group;
  }

  /** Swing tell for the killer; injured and downed looks for survivors. */
  private pose(body: Group, p: SimPlayer): void {
    const arm = body.getObjectByName("arm");
    if (arm) {
      const s = this.sim.swing;
      arm.rotation.x = p.swing === s.windup ? 1.1 : p.swing === s.recover ? -0.5 : 0;
      return;
    }
    const torso = body.children[0] as Mesh;
    torso.material = p.health === this.sim.health.healthy ? this.survivorMat : this.injuredMat;
    // Downed survivors lie low; carried ones lie across the killer's shoulder;
    // hooked ones hang off the ground. Proper animation comes with the art pass.
    const downed = p.health === this.sim.health.downed;
    body.scale.y = downed && !p.onHook ? 0.3 : 1;
    body.position.y = p.carried ? 1.5 : p.onHook ? 0.6 : 0;
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
    this.retro.resize(aspect);
  }
}
