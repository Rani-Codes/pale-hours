import { BoxGeometry, Group, Mesh, MeshLambertMaterial, type Material } from "three";
import { snapped } from "./retro";
import { cloth } from "./textures";

/**
 * Low-poly people built from boxes on a joint hierarchy, posed every frame
 * from sim state. Forward is -z, up is +y, the root sits at the feet.
 * A positive x rotation swings a hanging limb forward.
 */

const mat = (color: number, textured = false) => snapped(new MeshLambertMaterial({ color, map: textured ? cloth() : null }));

function box(w: number, h: number, d: number, m: Material, y = 0, z = 0): Mesh {
  const mesh = new Mesh(new BoxGeometry(w, h, d), m);
  mesh.position.set(0, y, z);
  return mesh;
}

/** A two-segment limb hanging from its pivot: upper part, a joint, lower part. */
class Limb {
  readonly pivot = new Group();
  readonly joint = new Group();
  readonly end = new Group(); // where a hand holds things

  constructor(upper: number, lower: number, w: number, upperMat: Material, lowerMat: Material) {
    this.pivot.add(box(w, upper, w, upperMat, -upper / 2));
    this.joint.position.y = -upper;
    this.joint.add(box(w * 0.9, lower, w * 0.9, lowerMat, -lower / 2));
    this.end.position.y = -lower;
    this.joint.add(this.end);
    this.pivot.add(this.joint);
  }

  set(swing: number, bend: number, spread = 0) {
    this.pivot.rotation.set(swing, 0, spread);
    this.joint.rotation.x = bend;
  }
}

/** The joints every character shares. */
export class Rig {
  readonly root = new Group(); // placed and turned by the renderer
  readonly body = new Group(); // tilted for lying down and carrying
  readonly hips = new Group();
  readonly chest = new Group();
  readonly head = new Group();
  readonly armL: Limb;
  readonly armR: Limb;
  readonly legL: Limb;
  readonly legR: Limb;
  readonly hipHeight: number;

  constructor(s: { hip: number; torso: number; width: number; arm: number; limb: number; shirt: Material; pants: Material; skin: Material; head: Mesh }) {
    this.hipHeight = s.hip;
    this.root.add(this.body);
    this.body.add(this.hips);
    this.hips.position.y = s.hip;
    this.hips.add(box(s.width * 0.9, 0.18, s.limb * 2.2, s.pants, 0.02));
    this.hips.add(this.chest);
    this.chest.add(box(s.width, s.torso, s.limb * 2.4, s.shirt, s.torso / 2 + 0.08));
    this.head.position.y = s.torso + 0.12;
    this.head.add(s.head);
    this.chest.add(this.head);
    this.armL = new Limb(s.arm * 0.52, s.arm * 0.48, s.limb, s.shirt, s.skin);
    this.armR = new Limb(s.arm * 0.52, s.arm * 0.48, s.limb, s.shirt, s.skin);
    this.armL.pivot.position.set(-(s.width / 2 + s.limb / 2), s.torso + 0.02, 0);
    this.armR.pivot.position.set(s.width / 2 + s.limb / 2, s.torso + 0.02, 0);
    this.chest.add(this.armL.pivot, this.armR.pivot);
    const leg = s.hip - 0.02;
    this.legL = new Limb(leg * 0.52, leg * 0.48, s.limb * 1.15, s.pants, s.pants);
    this.legR = new Limb(leg * 0.52, leg * 0.48, s.limb * 1.15, s.pants, s.pants);
    this.legL.pivot.position.x = -s.width / 4;
    this.legR.pivot.position.x = s.width / 4;
    this.hips.add(this.legL.pivot, this.legR.pivot);
  }

  /** Back to standing straight. */
  rest() {
    this.body.position.set(0, 0, 0);
    this.body.rotation.set(0, 0, 0);
    this.hips.position.y = this.hipHeight;
    this.hips.rotation.set(0, 0, 0);
    this.chest.rotation.set(0, 0, 0);
    this.head.rotation.set(0, 0, 0);
    for (const l of [this.armL, this.armR, this.legL, this.legR]) l.set(0, 0);
  }

  /** A walk or run cycle. phase in radians, amount 0 standing to 1 full stride. */
  walk(phase: number, amount: number, limp = 0) {
    const s = Math.sin(phase);
    const stride = 0.75 * amount;
    this.legL.set(s * stride, Math.max(0, -Math.cos(phase)) * 0.9 * amount);
    this.legR.set(-s * stride * (1 - limp * 0.5), Math.max(0, Math.cos(phase)) * 0.9 * amount * (1 - limp * 0.6));
    this.armL.set(-s * 0.6 * amount, 0.3 * amount);
    this.armR.set(s * 0.6 * amount, 0.3 * amount);
    this.hips.position.y = this.hipHeight - Math.abs(Math.cos(phase)) * 0.05 * amount - limp * 0.04;
    this.chest.rotation.x = 0.12 * amount + limp * 0.15;
    this.chest.rotation.z = limp * 0.12 * Math.sin(phase);
  }
}

// Survivors differ by clothes so players can tell them apart in the dark.
const shirts = [0x7a6a3a, 0x2e5c5a, 0x6e2e2e, 0x4c5a2e, 0x5a4a6e];
const pants = [0x2c2c34, 0x3a3226, 0x26303a, 0x302a26, 0x2e2e2a];
const skins = [0xc8a088, 0x8a6048, 0xe0bca0, 0x6a4a38, 0xb08868];

export class SurvivorModel {
  readonly rig: Rig;
  private readonly blood: Mesh;

  constructor(id: number) {
    const skin = mat(skins[id % skins.length]);
    const head = box(0.22, 0.26, 0.24, skin, 0.1);
    const hair = box(0.24, 0.08, 0.26, mat(0x2a2018), 0.24);
    head.add(hair);
    hair.position.y = 0.12;
    for (const x of [-0.05, 0.05]) {
      const eye = box(0.035, 0.03, 0.01, mat(0x101010), 0.02, -0.122);
      eye.position.x = x;
      head.add(eye);
    }
    this.rig = new Rig({ hip: 0.86, torso: 0.56, width: 0.4, arm: 0.66, limb: 0.11, shirt: mat(shirts[id % shirts.length], true), pants: mat(pants[id % pants.length], true), skin, head });
    // A dark stain on the shirt once hurt.
    this.blood = box(0.26, 0.24, 0.02, mat(0x5a0808), 0.3, -0.14);
    this.rig.chest.add(this.blood);
  }

  get object() {
    return this.rig.root;
  }

  /**
   * Pose for this frame. speed in m/s from how far they moved, t in seconds.
   * state carries what the sim says about them.
   */
  pose(state: { injured: boolean; downed: boolean; carried: boolean; hooked: boolean; working: boolean }, speed: number, phase: number, t: number) {
    const r = this.rig;
    r.rest();
    this.blood.visible = state.injured || state.downed;
    if (state.hooked) {
      // Hanging from the hook through the shoulder: one arm up gripping it, the rest limp, a slow sway.
      r.body.position.y = 0.95;
      r.body.rotation.z = 0.08 * Math.sin(t * 1.3);
      r.head.rotation.x = 0.5;
      r.armL.set(Math.PI - 0.15, 0.5);
      r.armR.set(0.1, 0.2, 0.15);
      r.legL.set(0.1 + 0.05 * Math.sin(t * 1.7), 0.2);
      r.legR.set(-0.05, 0.3);
      return;
    }
    if (state.carried) {
      // Face down over the killer's shoulder, head behind him; the renderer turns the root to face his back.
      r.body.rotation.x = -Math.PI / 2;
      r.body.position.set(0.28, 1.62, r.hipHeight);
      r.head.rotation.x = 0.4;
      r.armL.set(0.3 + 0.2 * Math.sin(t * 6), 0.2);
      r.armR.set(0.3 + 0.2 * Math.sin(t * 6 + 1), 0.2);
      r.legL.set(-0.4, 0.8);
      r.legR.set(-0.2, 1.0);
      return;
    }
    if (state.downed) {
      // Prone, head first, dragging forward on the elbows.
      r.body.rotation.x = -Math.PI / 2;
      r.body.position.set(0, 0.14, r.hipHeight * 1.05);
      r.head.rotation.x = -0.9;
      const crawl = Math.min(1, speed / 0.5);
      const c = Math.sin(phase);
      r.armL.set(Math.PI - 0.3 + c * 0.5 * crawl, -0.8);
      r.armR.set(Math.PI - 0.3 - c * 0.5 * crawl, -0.8);
      r.legL.set(c * 0.15 * crawl, 0.3 + Math.max(0, c) * 0.6 * crawl);
      r.legR.set(-c * 0.15 * crawl, 0.3 + Math.max(0, -c) * 0.6 * crawl);
      return;
    }
    if (state.working) {
      // Kneeling at the job, hands busy.
      r.hips.position.y = 0.5;
      r.legL.set(1.5, -1.5);
      r.legR.set(-0.15, 1.6);
      r.chest.rotation.x = 0.35;
      r.armL.set(1.1 + 0.15 * Math.sin(t * 9), 0.5);
      r.armR.set(1.1 + 0.15 * Math.sin(t * 9 + 2), 0.5);
      return;
    }
    r.walk(phase, Math.min(1, speed / 4), state.injured ? 1 : 0);
    if (state.injured) r.armL.set(0.5, 1.6); // a hand pressed to the wound
  }
}

export interface SwingView {
  /** "windup", "strike" (the first moment of recovery), "recover", or "idle". */
  stage: "idle" | "windup" | "strike" | "recover";
  /** 0 to 1 through the stage. */
  k: number;
}

/** The killer: tall, hunched, long coat, a pale mask, a cleaver in the right hand. */
export class KillerModel {
  readonly rig: Rig;

  constructor() {
    const coat = mat(0x2a2422, true);
    const mask = mat(0xd8d0bc);
    const head = box(0.26, 0.32, 0.28, mask, 0.12);
    for (const x of [-0.06, 0.06]) {
      const slit = box(0.05, 0.03, 0.02, mat(0x050505), 0.05, -0.145);
      slit.position.x = x;
      head.add(slit);
    }
    head.add(box(0.12, 0.02, 0.02, mat(0x050505), -0.06, -0.145));
    this.rig = new Rig({ hip: 1.0, torso: 0.68, width: 0.56, arm: 0.86, limb: 0.15, shirt: coat, pants: mat(0x1c1a1a, true), skin: mat(0x6a5e56), head });
    // The coat's skirt, hanging from the hips.
    this.rig.hips.add(box(0.62, 0.62, 0.36, coat, -0.3));
    this.rig.armR.end.add(cleaver());
  }

  get object() {
    return this.rig.root;
  }

  pose(state: { carrying: boolean; stunned: boolean }, swing: SwingView, speed: number, phase: number, t: number) {
    const r = this.rig;
    r.rest();
    r.walk(phase, Math.min(1, speed / 4.6) * 0.8);
    r.chest.rotation.x += 0.22; // always hunched
    r.head.rotation.x = -0.15;
    if (state.carrying) r.armL.set(-2.7, -1.2, -0.2); // a hand on the survivor over his shoulder
    if (state.stunned) {
      r.chest.rotation.x = -0.35 + 0.1 * Math.sin(t * 14);
      r.armL.set(0.6, 0.4, -0.6);
      r.armR.set(0.6, 0.4, 0.6);
      r.head.rotation.x = -0.5;
      return;
    }
    const ease = (k: number) => k * k * (3 - 2 * k);
    switch (swing.stage) {
      case "windup":
        r.armR.set(-2.5 * ease(swing.k), -1.2 * ease(swing.k), 0.3);
        r.chest.rotation.y = -0.4 * ease(swing.k);
        break;
      case "strike":
        r.armR.set(-2.5 + 3.7 * ease(swing.k), -1.2 + 1.1 * swing.k, 0.3 - 0.5 * swing.k);
        r.chest.rotation.y = -0.4 + 0.8 * swing.k;
        r.chest.rotation.x += 0.25 * swing.k;
        break;
      case "recover":
        r.armR.set(1.2 * (1 - ease(swing.k)), -0.1, -0.2 * (1 - swing.k));
        r.chest.rotation.y = 0.4 * (1 - swing.k);
        r.chest.rotation.x += 0.25 * (1 - swing.k);
        break;
    }
  }
}

/** A heavy, notched cleaver: a wrapped handle and a broad rusty blade. */
export function cleaver(): Group {
  const g = new Group();
  const handle = box(0.05, 0.3, 0.05, mat(0x3a2a1e));
  handle.position.y = -0.05;
  const blade = box(0.03, 0.42, 0.2, mat(0x8a8078));
  blade.position.set(0, -0.38, 0.08);
  const edge = box(0.032, 0.42, 0.03, mat(0x5a2420));
  edge.position.set(0, -0.38, 0.19);
  g.add(handle, blade, edge);
  g.rotation.x = Math.PI / 2; // from a hanging hand: blade forward, edge down
  return g;
}
