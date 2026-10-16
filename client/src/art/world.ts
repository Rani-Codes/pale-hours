import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  PointLight,
  TorusGeometry,
  type Texture,
} from "three";
import { snapped } from "./retro";
import { brick, concrete, dirt, rust, wood } from "./textures";

/**
 * The static world, modeled in code: textured walls and floor, generators,
 * hooks and gates. Sizes are meters, in Three's frame (x east, y up, -z north).
 */

const lambert = (map: Texture | null, color = 0xffffff, extra: ConstructorParameters<typeof MeshLambertMaterial>[0] = {}) =>
  snapped(new MeshLambertMaterial({ map, color, ...extra }));

/**
 * Box UVs scaled to world size, so a texture keeps the same texel size on
 * every wall however long it is. tile is meters per texture repeat.
 */
export function worldBox(w: number, h: number, d: number, tile: number): BufferGeometry {
  const g = new BoxGeometry(w, h, d);
  const uv = g.getAttribute("uv");
  // BoxGeometry faces, 4 vertices each: +x, -x, +y, -y, +z, -z.
  const faces: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  faces.forEach(([fu, fv], f) => {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, (uv.getX(k) * fu) / tile, (uv.getY(k) * fv) / tile);
    }
  });
  return g;
}

export function floor(halfExtent: number): Mesh {
  const size = 2 * halfExtent + 40; // runs on under the treeline past the edge
  const geo = new PlaneGeometry(size, size, 24, 24);
  const uv = geo.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * size) / 2, (uv.getY(i) * size) / 2);
  const mesh = new Mesh(geo, lambert(dirt()));
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

const wallMat = () => lambert(brick(), 0xb8b0a8);
const capMat = () => lambert(concrete(), 0x77757a);

/** A brick wall with a concrete cap along its top. */
export function wall(w: number, h: number, d: number): Group {
  const g = new Group();
  const body = new Mesh(worldBox(w, h, d, 1.5), wallMat());
  body.position.y = h / 2;
  const cap = new Mesh(worldBox(w + 0.08, 0.14, d + 0.08, 1), capMat());
  cap.position.y = h + 0.07;
  g.add(body, cap);
  return g;
}

/**
 * A window to vault through: brick to waist height with a worn sill, a
 * wooden frame, and brick again above. Only the waist-high part is solid in
 * the sim; the opening is what survivors go through.
 */
export function vaultModel(w: number, h: number, d: number): Group {
  const g = new Group();
  const sill = 1.0;
  const top = 2.4;
  const lower = new Mesh(worldBox(w, sill, d, 1.5), wallMat());
  lower.position.y = sill / 2;
  const ledge = new Mesh(worldBox(w + 0.06, 0.08, d + 0.16, 1), lambert(wood(), 0x8a7a6a));
  ledge.position.y = sill + 0.04;
  const upper = new Mesh(worldBox(w, h - top, d, 1.5), wallMat());
  upper.position.y = (h + top) / 2;
  const cap = new Mesh(worldBox(w + 0.08, 0.14, d + 0.08, 1), capMat());
  cap.position.y = h + 0.07;
  g.add(lower, ledge, upper, cap);
  // Frame posts at both ends of the opening, along its long side.
  const along = w > d;
  for (const s of [-1, 1]) {
    const post = new Mesh(worldBox(along ? 0.12 : d + 0.04, top - sill, along ? d + 0.04 : 0.12, 1), lambert(wood(), 0x6a5a4a));
    post.position.set(along ? (s * (w - 0.12)) / 2 : 0, (sill + top) / 2, along ? 0 : (s * (d - 0.12)) / 2);
    g.add(post);
  }
  return g;
}

/** A generator: a rusted engine on a skid, pistons that pump while it is worked on, a lamp that lights when done. */
export class GeneratorModel {
  readonly object = new Group();
  private readonly body = new Group(); // shakes while it runs
  private readonly pistons: Mesh[] = [];
  private readonly lamp: MeshLambertMaterial;
  private readonly glow: PointLight;
  private lastProgress = -1;
  private working = 0; // seconds of pumping left

  constructor(half: number) {
    const metal = lambert(rust());
    const dark = lambert(rust(), 0x55504c);
    const skid = new Mesh(worldBox(2 * half + 0.1, 0.15, 2 * half + 0.1, 1), dark);
    skid.position.y = 0.075;
    const block = new Mesh(worldBox(2 * half, 0.8, 2 * half * 0.8, 0.8), metal);
    block.position.y = 0.55;
    const tank = new Mesh(new CylinderGeometry(0.22, 0.22, 2 * half * 0.9, 8), dark);
    tank.rotation.z = Math.PI / 2;
    tank.position.set(0, 1.07, 0.15);
    const pipe = new Mesh(new CylinderGeometry(0.05, 0.05, 0.9, 6), dark);
    pipe.position.set(-half * 0.7, 1.2, -half * 0.5);
    this.object.add(this.body);
    this.body.add(skid, block, tank, pipe);
    for (const x of [-0.18, 0.18]) {
      const p = new Mesh(new CylinderGeometry(0.07, 0.07, 0.35, 6), lambert(null, 0x8a8a90));
      p.position.set(x, 1.05, -0.2);
      this.pistons.push(p);
      this.body.add(p);
    }
    this.lamp = lambert(null, 0x3a2a20, { emissive: new Color(0x000000) });
    const bulb = new Mesh(new BoxGeometry(0.16, 0.16, 0.16), this.lamp);
    bulb.position.set(half * 0.6, 1.0, -half * 0.55);
    this.glow = new PointLight(0xffc870, 0, 7, 1.5);
    this.glow.position.copy(bulb.position).y += 0.3;
    this.body.add(bulb, this.glow);
  }

  update(progress: number, ticks: number, dt: number, t: number) {
    if (this.lastProgress >= 0 && progress > this.lastProgress && progress < ticks) this.working = 0.4;
    this.lastProgress = progress;
    this.working = Math.max(0, this.working - dt);
    const pump = this.working > 0 ? 1 : 0;
    this.pistons.forEach((p, i) => (p.position.y = 1.05 + pump * 0.08 * Math.sin(t * 22 + i * Math.PI)));
    this.body.position.x = pump * 0.012 * Math.sin(t * 57);
    const done = progress >= ticks;
    this.lamp.emissive.setHex(done ? 0xffc870 : 0x000000);
    this.glow.intensity = done ? 6 : 0;
  }
}

/** A hook: a leaning wooden gallows post with a chain and a curved iron hook over the site. */
export function hookModel(): Group {
  const g = new Group();
  const timber = lambert(wood(), 0xa09080);
  const iron = lambert(rust(), 0x6a625c);
  const post = new Mesh(worldBox(0.22, 3.4, 0.22, 1), timber);
  post.position.set(-0.75, 1.7, 0);
  post.rotation.z = -0.06;
  const beam = new Mesh(worldBox(1.1, 0.18, 0.18, 1), timber);
  beam.position.set(-0.3, 3.3, 0);
  const brace = new Mesh(worldBox(0.6, 0.12, 0.12, 1), timber);
  brace.position.set(-0.55, 3.0, 0);
  brace.rotation.z = Math.PI / 4;
  g.add(post, beam, brace);
  for (let i = 0; i < 4; i++) {
    const link = new Mesh(new TorusGeometry(0.05, 0.015, 4, 6), iron);
    link.position.set(0.1, 3.15 - i * 0.09, 0);
    link.rotation.y = (i % 2) * (Math.PI / 2);
    g.add(link);
  }
  const hook = new Mesh(new TorusGeometry(0.12, 0.025, 4, 8, Math.PI * 1.4), iron);
  hook.position.set(0.1, 2.68, 0);
  hook.rotation.z = Math.PI * 0.85;
  g.add(hook);
  return g;
}

/** An exit gate: concrete pillars, a portcullis of iron bars that rises as it opens, and lamps on top. */
export class GateModel {
  readonly object = new Group();
  private readonly bars = new Group();
  private readonly lamps: MeshLambertMaterial[] = [];

  constructor(width: number) {
    const pillarMat = lambert(concrete());
    for (const x of [-width / 2 - 0.35, width / 2 + 0.35]) {
      const pillar = new Mesh(worldBox(0.7, 3.8, 0.7, 1.2), pillarMat);
      pillar.position.set(x, 1.9, 0);
      this.object.add(pillar);
      const lamp = lambert(null, 0x302020, { emissive: new Color(0) });
      this.lamps.push(lamp);
      const bulb = new Mesh(new BoxGeometry(0.22, 0.22, 0.22), lamp);
      bulb.position.set(x, 3.95, 0);
      this.object.add(bulb);
    }
    const lintel = new Mesh(worldBox(width + 1.4, 0.4, 0.6, 1.2), pillarMat);
    lintel.position.y = 3.7;
    this.object.add(lintel);
    const iron = lambert(rust(), 0x5a5550);
    const n = Math.round(width / 0.35);
    for (let i = 0; i <= n; i++) {
      const bar = new Mesh(new BoxGeometry(0.06, 3.4, 0.06), iron);
      bar.position.set(-width / 2 + (i * width) / n, 1.7, 0);
      this.bars.add(bar);
    }
    for (const y of [0.5, 1.7, 2.9]) {
      const rail = new Mesh(new BoxGeometry(width, 0.08, 0.08), iron);
      rail.position.y = y;
      this.bars.add(rail);
    }
    this.object.add(this.bars);
  }

  /** open is 0 shut to 1 fully open. */
  update(open: number, powered: boolean) {
    this.bars.position.y = open * 3.1;
    const color = open >= 1 ? 0x40ff70 : powered ? 0xff3020 : 0x000000;
    this.lamps.forEach((l) => l.emissive.setHex(color));
  }
}

/** The tall beam over a generator whose skill check was just missed, or over a hook a teammate was just hung on. Seen through walls and fog. */
export function noiseBeam(color = 0xffd27a): Mesh {
  const beam = new Mesh(new BoxGeometry(0.5, 60, 0.5), new MeshBasicMaterial({ color, transparent: true, opacity: 0.55, fog: false, depthTest: false }));
  beam.position.y = 30;
  beam.renderOrder = 10;
  beam.visible = false;
  return beam;
}
