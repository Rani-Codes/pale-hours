import { CanvasTexture, NearestFilter, NearestMipmapNearestFilter, RepeatWrapping, SRGBColorSpace, type Texture } from "three";

/**
 * Textures painted in code on tiny canvases, sampled with nearest filtering
 * so each texel stays a hard square. Every one is drawn from a fixed seed,
 * so the world looks the same on every load and every machine.
 */

type Paint = (px: (x: number, y: number, rgb: [number, number, number]) => void, rand: () => number, size: number) => void;

function mulberry(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const cache = new Map<string, Texture>();

function paint(name: string, size: number, seed: number, draw: Paint): Texture {
  const hit = cache.get(name);
  if (hit) return hit;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  draw(
    (x, y, [r, g, b]) => {
      const wrap = (v: number) => ((Math.floor(v) % size) + size) % size; // painters pass fractional, even negative, coordinates
      const i = 4 * (wrap(y) * size + wrap(x));
      img.data.set([r, g, b, 255], i);
    },
    mulberry(seed),
    size,
  );
  ctx.putImageData(img, 0, 0);
  const tex = new CanvasTexture(canvas);
  tex.magFilter = NearestFilter;
  tex.minFilter = NearestMipmapNearestFilter;
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  cache.set(name, tex);
  return tex;
}

const shade = (rgb: [number, number, number], k: number): [number, number, number] => rgb.map((c) => Math.max(0, Math.min(255, Math.round(c * k)))) as [number, number, number];

/** Packed dirt with darker clods and pale grit. */
export const dirt = () =>
  paint("dirt", 32, 11, (px, rand, n) => {
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) px(x, y, shade([58, 50, 40], 0.75 + rand() * 0.4));
    for (let i = 0; i < 40; i++) px(rand() * n, rand() * n, shade([38, 32, 26], 0.9 + rand() * 0.2));
    for (let i = 0; i < 14; i++) px(rand() * n, rand() * n, [92, 86, 72]);
  });

/** Soot-stained brick: staggered courses with dark mortar. */
export const brick = () =>
  paint("brick", 32, 23, (px, rand, n) => {
    for (let y = 0; y < n; y++) {
      const course = Math.floor(y / 4);
      for (let x = 0; x < n; x++) {
        const mortar = y % 4 === 3 || (x + (course % 2) * 4) % 8 === 7;
        const brickTone = 0.7 + ((Math.sin(course * 12.9 + Math.floor((x + (course % 2) * 4) / 8) * 78.2) + 1) / 2) * 0.35;
        px(x, y, mortar ? shade([40, 38, 36], 0.9 + rand() * 0.2) : shade([96, 62, 52], brickTone * (0.9 + rand() * 0.15)));
      }
    }
    // Soot creeping up from the ground.
    for (let x = 0; x < n; x++) for (let y = n - 6; y < n; y++) if (rand() < (y - (n - 6)) / 7) px(x, y, [30, 27, 26]);
  });

/** Pitted, rusting sheet metal. */
export const rust = () =>
  paint("rust", 32, 37, (px, rand, n) => {
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) px(x, y, shade([88, 84, 80], 0.7 + rand() * 0.25));
    for (let i = 0; i < 9; i++) {
      const cx = rand() * n;
      const cy = rand() * n;
      const r = 2 + rand() * 5;
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y < r * r * rand() * 1.4) px(cx + x, cy + y, shade([122, 64, 34], 0.7 + rand() * 0.4));
    }
    for (let x = 0; x < n; x++) px(x, 0, [52, 50, 48]); // a seam
  });

/** Weathered planks running along the texture's height. */
export const wood = () =>
  paint("wood", 32, 41, (px, rand, n) => {
    for (let x = 0; x < n; x++) {
      const plank = Math.floor(x / 8);
      const tone = 0.75 + ((plank * 37) % 10) / 30;
      for (let y = 0; y < n; y++) {
        const grain = Math.sin(y * 0.9 + plank * 3 + Math.sin(x * 1.7) * 2) * 0.08;
        px(x, y, x % 8 === 0 ? [34, 26, 20] : shade([92, 72, 52], tone + grain + rand() * 0.08));
      }
    }
  });

/** Cast concrete with stains, for gate pillars. */
export const concrete = () =>
  paint("concrete", 32, 53, (px, rand, n) => {
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) px(x, y, shade([104, 104, 100], 0.72 + rand() * 0.18 - (y / n) * 0.12));
    for (let i = 0; i < 6; i++) {
      const x = Math.floor(rand() * n);
      for (let y = 0; y < n * rand(); y++) px(x, y, [62, 60, 58]); // drip streaks
    }
  });

/** Coarse dark cloth, for clothes. */
export const cloth = () =>
  paint("cloth", 16, 61, (px, rand, n) => {
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) px(x, y, shade([200, 200, 200], ((x + y) % 2 ? 0.82 : 0.95) + rand() * 0.08));
  });
