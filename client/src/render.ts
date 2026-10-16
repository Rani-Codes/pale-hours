import {
  AmbientLight,
  DirectionalLight,
  Fog,
  Mesh,
  OrthographicCamera,
  PerspectiveCamera,
  PointLight,
  Scene,
  WebGLRenderer,
} from "three";
import { view } from "./config";
import { dressing } from "./art/dressing";
import { KillerModel, SurvivorModel, type SwingView } from "./art/characters";
import { RetroPass } from "./art/retro";
import { ViewModel } from "./art/viewmodel";
import { floor, GateModel, GeneratorModel, hookModel, noiseBeam, vaultModel, wall } from "./art/world";
import type { PaleSim, SimPlayer, World } from "./sim";

const M = 1_000_000; // micrometers per meter
const WALL_HEIGHT = 3;
const STRIKE_S = 0.12; // the fast part of a swing, at the start of the recovery
const gone = (p: SimPlayer | undefined) => !p || p.escaped || p.eliminated;

/** One player's model and what the renderer remembers about them between frames. */
interface Actor {
  model: SurvivorModel | KillerModel;
  x: number;
  y: number;
  /** Smoothed meters per second, from how far they moved. */
  speed: number;
  /** Walk cycle, radians. */
  phase: number;
  swing: number;
  swingSince: number;
}

/**
 * Draws the sim's world in Three.js. The sim's plane is (x, y); here that is
 * Three's (x, -z) with y up, so +y in the sim is "north", away from the camera.
 */
export class Renderer {
  private readonly gl: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly overhead: OrthographicCamera;
  private readonly eye = new PerspectiveCamera(view.survivor.fov, 1, view.near, view.far);
  private readonly actors = new Map<number, Actor>();
  private readonly viewModel = new ViewModel();
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

  constructor(
    canvas: HTMLCanvasElement,
    private readonly sim: PaleSim,
  ) {
    this.gl = new WebGLRenderer({ canvas, antialias: false });
    this.gl.setClearColor(view.fog.color);

    const half = sim.mapHalfExtent / M;
    this.scene.add(this.ambient, this.sun, this.lantern);
    this.sun.position.set(-20, 60, 30);

    this.scene.add(floor(half), dressing(sim));
    for (const w of sim.walls) {
      const mesh = wall((w.maxX - w.minX) / M, WALL_HEIGHT, (w.maxY - w.minY) / M);
      mesh.position.set((w.minX + w.maxX) / 2 / M, 0, -(w.minY + w.maxY) / 2 / M);
      this.scene.add(mesh);
    }
    for (const v of sim.vaults) {
      const mesh = vaultModel((v.maxX - v.minX) / M, WALL_HEIGHT, (v.maxY - v.minY) / M);
      mesh.position.set((v.minX + v.maxX) / 2 / M, 0, -(v.minY + v.maxY) / 2 / M);
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

    // Compile every shader now, with one of each model in the scene, so the
    // first time someone comes into view does not stall the frame (and the
    // host's tick loop with it).
    const warm = [new SurvivorModel(0), new KillerModel()].map((m) => m.object);
    this.scene.add(...warm);
    this.gl.compile(this.scene, this.eye);
    this.gl.compile(this.viewModel.scene, this.eye);
    this.scene.remove(...warm);
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
      this.animate(p, players, dt, now);
    }
    for (const [id, a] of this.actors) {
      if (live.has(id)) continue;
      this.scene.remove(a.model.object);
      this.actors.delete(id);
    }

    const me = players.find((p) => p.id === self);
    const mapLook = this.showMap || !me;
    const lit = mapLook || view.reviewLight;
    this.ambient.intensity = lit ? 0.8 : view.light.ambient;
    this.sun.intensity = lit ? 1.2 : view.light.moon;
    this.lantern.visible = !lit;
    this.scene.fog = lit ? null : new Fog(view.fog.color, view.fog.near, view.fog.far);
    this.gl.setClearColor(mapLook ? 0x0b0b0d : view.fog.color);
    if (mapLook || !me) {
      for (const [id, a] of this.actors) a.model.object.visible = !gone(players.find((p) => p.id === id));
      this.beams.forEach((b, i) => (b.visible = (noise[i] ?? 0) > 0));
      this.gl.render(this.scene, this.overhead);
      return;
    }
    // Your own body stays out of your first-person view.
    const killer = me.role === this.sim.roles.killer;
    for (const [id, a] of this.actors) {
      const p = players.find((q) => q.id === id);
      // The killer's own body, and whoever he carries, would sit inside his camera.
      a.model.object.visible = !(killer && (id === self || p?.carried)) && !gone(p);
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
    if (killer) {
      const a = this.actors.get(me.id)!;
      this.viewModel.update(this.eye, this.swingView(me, a, now), a.phase, Math.min(1, a.speed / 4));
    }
    this.retro.render(this.gl, this.scene, this.eye, killer && me.stun === 0 ? this.viewModel.scene : undefined);
  }

  /** Move and pose one player's model for this frame. */
  private animate(p: SimPlayer, players: SimPlayer[], dt: number, now: number) {
    const isKiller = p.role === this.sim.roles.killer;
    let a = this.actors.get(p.id);
    if (!a) {
      a = { model: isKiller ? new KillerModel() : new SurvivorModel(p.id), x: p.x, y: p.y, speed: 0, phase: 0, swing: p.swing, swingSince: now };
      this.actors.set(p.id, a);
      this.scene.add(a.model.object);
    }
    // Speed from movement, capped so a teleport (a rematch, a hook) is not a sprint.
    const moved = Math.hypot(p.x - a.x, p.y - a.y) / M;
    const inst = dt > 0 ? Math.min(8, moved / dt) : 0;
    a.speed += (inst - a.speed) * Math.min(1, dt * 10);
    a.phase += a.speed * dt * (isKiller ? 2.2 : 2.6);
    a.x = p.x;
    a.y = p.y;
    if (p.swing !== a.swing) {
      a.swing = p.swing;
      a.swingSince = now;
    }

    const root = a.model.object;
    root.visible = !gone(p);
    const yaw = (-p.yaw / 65536) * 2 * Math.PI;
    if (p.onHook) {
      const site = this.sim.hookSites[p.onHook - 1];
      root.position.set(site.x / M + 0.1, 0, -site.y / M);
      root.rotation.y = 0;
    } else {
      root.position.set(p.x / M, 0, -p.y / M);
      // Carried, they lie over the killer's shoulder facing his back; vaulting, they face where they are going.
      const carrier = p.carried ? players.find((k) => k.carrying === p.id) : undefined;
      const vaultYaw = -Math.atan2(p.vaultToX - p.vaultFromX, p.vaultToY - p.vaultFromY);
      root.rotation.y = carrier ? (-carrier.yaw / 65536) * 2 * Math.PI + Math.PI : p.vaultTicks > 0 ? vaultYaw : yaw;
    }
    const t = now / 1000;
    if (a.model instanceof KillerModel) {
      a.model.pose({ carrying: p.carrying !== 0, stunned: p.stun > 0 }, this.swingView(p, a, now), a.speed, a.phase, t);
    } else {
      const h = this.sim.health;
      a.model.pose(
        {
          injured: p.health === h.injured,
          downed: p.health === h.downed,
          carried: p.carried,
          hooked: p.onHook !== 0,
          working: p.repairing || p.helping !== 0,
          vault: p.vaultTicks > 0 ? 1 - p.vaultTicks / this.sim.vaultTicks : undefined,
        },
        a.speed,
        a.phase,
        t,
      );
    }
  }

  /** Where the killer is in a swing, in real time since the phase began. */
  private swingView(p: SimPlayer, a: Actor, now: number): SwingView {
    const s = this.sim.swing;
    const secs = (now - a.swingSince) / 1000;
    const tick = 1 / this.sim.tickRate;
    if (p.swing === s.windup) return { stage: "windup", k: Math.min(1, secs / (this.sim.attack.windupTicks * tick)) };
    if (p.swing !== s.recover) return { stage: "idle", k: 0 };
    if (secs < STRIKE_S) return { stage: "strike", k: secs / STRIKE_S };
    const total = (p.swingResult === s.hit ? this.sim.attack.recoverHitTicks : this.sim.attack.recoverMissTicks) * tick;
    return { stage: "recover", k: Math.min(1, (secs - STRIKE_S) / Math.max(0.01, total - STRIKE_S)) };
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
