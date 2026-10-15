import {
  AmbientLight,
  BoxGeometry,
  CylinderGeometry,
  DirectionalLight,
  Fog,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Scene,
  WebGLRenderer,
} from "three";
import { Color } from "three";
import { view } from "./config";
import type { PaleSim, SimPlayer, World } from "./sim";

const M = 1_000_000; // micrometers per meter
const WALL_HEIGHT = 3;
const KILLER_HEIGHT = 1.9;
const SURVIVOR_HEIGHT = 1.7;
const HOOK_HEIGHT = 3.2;
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
  private readonly genMats: MeshLambertMaterial[] = [];
  private readonly beams: Mesh[] = [];
  private readonly gateMats: MeshLambertMaterial[] = [];
  private readonly powered = new Color(0xc9a13a);
  private readonly idle = new Color(0x6e3b2c);
  private readonly done = new Color(0x3f8a52);
  private readonly killerMat = new MeshLambertMaterial({ color: 0xc0392b });
  private readonly survivorMat = new MeshLambertMaterial({ color: 0xd8d4c8 });
  private readonly injuredMat = new MeshLambertMaterial({ color: 0xa8514a });

  constructor(
    canvas: HTMLCanvasElement,
    private readonly sim: PaleSim,
  ) {
    this.gl = new WebGLRenderer({ canvas, antialias: false });
    this.gl.setClearColor(view.fog.color);

    const half = sim.mapHalfExtent / M;
    this.scene.add(this.ambient, this.sun, this.lantern);
    this.sun.position.set(-20, 60, 30);

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

    // Generators: a box that turns from rust to green as it is repaired.
    const g = sim.generatorHalf / M;
    for (const site of sim.genSites) {
      const mat = new MeshLambertMaterial({ color: this.idle });
      this.genMats.push(mat);
      const box = new Mesh(new BoxGeometry(2 * g, 1.2, 2 * g), mat);
      box.position.set(site.x / M, 0.6, -site.y / M);
      this.scene.add(box);
    }

    // A missed skill check lights a beam over its generator. Only the killer
    // sees it, through walls and fog, for a moment.
    const beamMat = new MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.55, fog: false, depthTest: false });
    for (const site of sim.genSites) {
      const beam = new Mesh(new BoxGeometry(0.5, 60, 0.5), beamMat);
      beam.position.set(site.x / M, 30, -site.y / M);
      beam.renderOrder = 10;
      beam.visible = false;
      this.beams.push(beam);
      this.scene.add(beam);
    }

    // Gates: two posts and a lintel that go rust, amber once powered, green once open.
    const reach = sim.gateRange / M / 2;
    for (const site of sim.gateSites) {
      const mat = new MeshLambertMaterial({ color: this.idle });
      this.gateMats.push(mat);
      for (const dx of [-reach, reach]) {
        const post = new Mesh(new BoxGeometry(0.5, 3.4, 0.5), mat);
        post.position.set(site.x / M + dx, 1.7, -site.y / M);
        this.scene.add(post);
      }
      const lintel = new Mesh(new BoxGeometry(2 * reach + 0.5, 0.5, 0.5), mat);
      lintel.position.set(site.x / M, 3.45, -site.y / M);
      this.scene.add(lintel);
    }

    // Hooks: a pale post with an arm reaching out over the spot the survivor hangs.
    const hookMat = new MeshLambertMaterial({ color: 0x9c968a });
    for (const site of sim.hookSites) {
      const post = new Mesh(new BoxGeometry(0.25, HOOK_HEIGHT, 0.25), hookMat);
      post.position.set(site.x / M - 0.5, HOOK_HEIGHT / 2, -site.y / M);
      const arm = new Mesh(new BoxGeometry(0.8, 0.15, 0.15), hookMat);
      arm.position.set(site.x / M - 0.15, HOOK_HEIGHT - 0.1, -site.y / M);
      this.scene.add(post, arm);
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
    const { gens, noise, gates } = world;
    this.genMats.forEach((mat, i) => mat.color.copy(this.idle).lerp(this.done, Math.min(1, (gens[i] ?? 0) / this.sim.genTicks)));
    const powered = gens.filter((g) => g >= this.sim.genTicks).length >= this.sim.gensRequired;
    this.gateMats.forEach((mat, i) => {
      const open = (gates[i] ?? 0) >= this.sim.gateTicks;
      mat.color.copy(open ? this.done : powered ? this.powered : this.idle);
    });
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
  }
}
