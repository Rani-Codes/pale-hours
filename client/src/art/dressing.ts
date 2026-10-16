import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Group,
  InstancedMesh,
  MeshLambertMaterial,
  Object3D,
  type BufferGeometry,
  type Material,
} from "three";
import { snapped } from "./retro";
import { mulberry, wood } from "./textures";
import type { PaleSim } from "../sim";
import { view } from "../config";

/**
 * Set dressing: a weathered fence along the map edge with gaps at the exits
 * (the sim's Fences are what actually stop players there), a ring of pines
 * beyond it, and small rocks
 * and grass in open ground. Scattered from a fixed seed, so every player
 * sees the same field. Meters, in Three's frame (x east, -z north).
 */

const M = 1_000_000;

function instanced(geo: BufferGeometry, mat: Material, items: { x: number; y: number; z: number; s: number; sy?: number; ry: number; rz?: number }[]): InstancedMesh {
  const mesh = new InstancedMesh(geo, mat, items.length);
  const o = new Object3D();
  items.forEach((it, i) => {
    o.position.set(it.x, it.y, it.z);
    o.rotation.set(0, it.ry, it.rz ?? 0);
    o.scale.set(it.s, it.sy ?? it.s, it.s);
    o.updateMatrix();
    mesh.setMatrixAt(i, o.matrix);
  });
  return mesh;
}

export function dressing(sim: PaleSim): Group {
  const g = new Group();
  const rand = mulberry(97);
  const half = sim.mapHalfExtent / M;

  // Keep scatter clear of everything players use or run along.
  const clear = (x: number, y: number, margin: number) =>
    ![...sim.walls, ...sim.lanes].some((w) => x > w.minX / M - margin && x < w.maxX / M + margin && y > w.minY / M - margin && y < w.maxY / M + margin) &&
    ![...sim.genSites, ...sim.gateSites, ...sim.hookSites].some((s) => Math.hypot(s.x / M - x, s.y / M - y) < margin + 2);

  // The fence: leaning posts and two rails, open only at the gates. It is the sim's edge, so it never shows a gap players cannot use.
  const posts: Parameters<typeof instanced>[2] = [];
  const rails: Parameters<typeof instanced>[2] = [];
  const edge = half; // on the sim's fence line, which is what stops players
  const gap = sim.gateHalfWidth / M + 0.7; // the gate and its pillars
  for (let side = 0; side < 4; side++) {
    for (let a = -half; a < half; a += 2.5) {
      const along = a + 1.25;
      // North and south edges carry the gates; leave them open there.
      if (side < 2 && sim.gateSites.some((s) => Math.abs(s.x / M - along) < gap)) continue;
      const [x, y] = side === 0 ? [along, edge] : side === 1 ? [along, -edge] : side === 2 ? [edge, along] : [-edge, along];
      const ry = side < 2 ? 0 : Math.PI / 2;
      posts.push({ x: x - (side < 2 ? 1.25 : 0), y: 0.7, z: -(y - (side < 2 ? 0 : 1.25)), s: 1, ry, rz: (rand() - 0.5) * 0.2 });
      for (const h of [0.45, 1.05]) if (rand() > 0.12) rails.push({ x, y: h + (rand() - 0.5) * 0.08, z: -y, s: 1, ry, rz: (rand() - 0.5) * 0.06 });
    }
  }
  const timber = snapped(new MeshLambertMaterial({ map: wood(), color: 0x8a7a6a }));
  g.add(instanced(new BoxGeometry(0.14, 1.4, 0.14), timber, posts), instanced(new BoxGeometry(2.5, 0.1, 0.05), timber, rails));

  // Pines in a ring beyond the fence: a trunk and two stacked cones each.
  const trees: { x: number; z: number; s: number; ry: number }[] = [];
  while (trees.length < 260) {
    const x = (rand() * 2 - 1) * (half + 16);
    const y = (rand() * 2 - 1) * (half + 16);
    if (Math.max(Math.abs(x), Math.abs(y)) < half + 2.5) continue;
    // Not in an exit lane or on top of its walls.
    if (sim.gateSites.some((s) => Math.abs(x - s.x / M) < gap + 1.5 && Math.sign(y) === Math.sign(s.y) && Math.abs(y) < half + view.exit.roadLength + 3)) continue;
    trees.push({ x, z: -y, s: 0.8 + rand() * 0.9, ry: rand() * Math.PI });
  }
  const bark = snapped(new MeshLambertMaterial({ color: 0x2a221c }));
  const needles = snapped(new MeshLambertMaterial({ color: 0x1c2620 }));
  g.add(
    instanced(new CylinderGeometry(0.12, 0.18, 2.2, 5), bark, trees.map((t) => ({ ...t, y: 1.1 * t.s }))),
    instanced(new ConeGeometry(1.5, 3.2, 6), needles, trees.map((t) => ({ ...t, y: 2.9 * t.s }))),
    instanced(new ConeGeometry(1.0, 2.4, 6), needles, trees.map((t) => ({ ...t, y: 4.5 * t.s, ry: t.ry + 0.5 }))),
  );

  // Rocks and grass in open ground: small enough that nobody mistakes them for cover.
  const scatter = (n: number, margin: number) => {
    const out: { x: number; z: number; ry: number; r: number }[] = [];
    for (let tries = 0; out.length < n && tries < n * 20; tries++) {
      const x = (rand() * 2 - 1) * (half - 1);
      const y = (rand() * 2 - 1) * (half - 1);
      if (clear(x, y, margin)) out.push({ x, z: -y, ry: rand() * Math.PI * 2, r: rand() });
    }
    return out;
  };
  const stone = snapped(new MeshLambertMaterial({ color: 0x5a5856 }));
  g.add(instanced(new DodecahedronGeometry(0.3, 0), stone, scatter(70, 1).map((p) => ({ ...p, y: 0.05, s: 0.4 + p.r * 0.7, sy: 0.25 + p.r * 0.3 }))));
  const grass = snapped(new MeshLambertMaterial({ color: 0x3a4028 }));
  // Each tuft is three short blades leaning out from one spot.
  const blades = scatter(500, 0.6).flatMap((p) =>
    [0, 1, 2].map((i) => {
      const a = p.ry + (i * Math.PI * 2) / 3;
      return { x: p.x + Math.cos(a) * 0.05, y: 0.12, z: p.z + Math.sin(a) * 0.05, s: 0.6 + p.r * 0.6, ry: a, rz: 0.35 + ((i * 0.37 + p.r) % 0.3) };
    }),
  );
  g.add(instanced(new ConeGeometry(0.05, 0.3, 3), grass, blades));
  return g;
}

/**
 * The tall grass patches: dense stalks a little taller than a crouched survivor,
 * so one hiding in it is lost to the eye and one standing is not. The sim's
 * Grass boxes are what actually hide them.
 */
export function tallGrass(sim: PaleSim): Group {
  const g = new Group();
  const rand = mulberry(0x7a11);
  const stalk = snapped(new MeshLambertMaterial({ color: 0x55672f }));
  const blades: { x: number; y: number; z: number; s: number; sy: number; ry: number; rz: number }[] = [];
  for (const b of sim.grass) {
    const w = (b.maxX - b.minX) / M;
    const d = (b.maxY - b.minY) / M;
    for (let i = 0; i < Math.round(w * d * view.tallGrass.density); i++) {
      const x = b.minX / M + rand() * w;
      const y = b.minY / M + rand() * d;
      const tall = view.tallGrass.minHeight + rand() * (view.tallGrass.maxHeight - view.tallGrass.minHeight);
      blades.push({ x, y: tall / 2, z: -y, s: 1, sy: tall, ry: rand() * Math.PI, rz: (rand() - 0.5) * 0.3 });
    }
  }
  g.add(instanced(new ConeGeometry(0.09, 1, 3), stalk, blades));
  return g;
}
