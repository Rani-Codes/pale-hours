import {
  HalfFloatType,
  Mesh,
  NearestFilter,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
  type Camera,
  type Material,
  type WebGLRenderer,
} from "three";

/** Shared by every snapped material: half the low-res target size, in pixels. */
const snapRes = { value: new Vector2(160, 120) };

/**
 * Patch a material so its vertices land on the low-res pixel grid, the way
 * the PS1 had no sub-pixel precision. Things wobble a little as they move.
 */
export function snapped<T extends Material>(mat: T): T {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.snapRes = snapRes;
    shader.vertexShader = shader.vertexShader
      .replace("void main() {", "uniform vec2 snapRes;\nvoid main() {")
      .replace(
        "#include <project_vertex>",
        "#include <project_vertex>\n  if (gl_Position.w > 0.0) gl_Position.xy = floor(gl_Position.xy / gl_Position.w * snapRes + 0.5) / snapRes * gl_Position.w;",
      );
  };
  mat.customProgramCacheKey = () => "snapped";
  return mat;
}

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

// Quantize each channel to a few levels, nudged by a 4x4 Bayer matrix so the
// steps break up into a fine dither instead of hard bands.
const fragmentShader = /* glsl */ `
uniform sampler2D tex;
uniform vec2 size;
uniform float levels;
uniform float dither;
varying vec2 vUv;
float bayer(vec2 p) {
  int x = int(mod(p.x, 4.0));
  int y = int(mod(p.y, 4.0));
  int i = x + y * 4;
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[i]) + 0.5) / 16.0 - 0.5;
}
void main() {
  vec4 c = linearToOutputTexel(texture2D(tex, vUv));
  vec2 px = floor(vUv * size);
  vec3 q = floor(c.rgb * levels + 0.5 + bayer(px) * dither) / levels;
  gl_FragColor = vec4(clamp(q, 0.0, 1.0), 1.0);
}`;

export interface RetroOptions {
  /** Rows of pixels in the low-res image; columns follow the aspect ratio. */
  pixelHeight: number;
  /** Brightness steps per color channel. */
  colorLevels: number;
  /** 0 for hard bands, 1 for a full ordered dither between them. */
  dither: number;
}

/**
 * Renders a scene into a small target, then stretches it over the canvas
 * with hard pixels, banded color and an ordered dither.
 */
export class RetroPass {
  private readonly target: WebGLRenderTarget;
  private readonly post: ShaderMaterial;
  private readonly postScene = new Scene();
  private readonly postCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly opts: RetroOptions;

  constructor(opts: RetroOptions) {
    this.opts = opts;
    this.target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, minFilter: NearestFilter, magFilter: NearestFilter });
    this.post = new ShaderMaterial({
      uniforms: { tex: { value: this.target.texture }, size: { value: new Vector2(1, 1) }, levels: { value: opts.colorLevels }, dither: { value: opts.dither } },
      vertexShader,
      fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    this.postScene.add(new Mesh(new PlaneGeometry(2, 2), this.post));
  }

  /** Match the target to the canvas aspect. */
  resize(aspect: number) {
    const h = this.opts.pixelHeight;
    const w = Math.round(h * aspect);
    if (this.target.width === w && this.target.height === h) return;
    this.target.setSize(w, h);
    this.post.uniforms.size.value.set(w, h);
    snapRes.value.set(w / 2, h / 2);
  }

  /** Draw scene, then overlay on a cleared depth buffer (a first-person weapon), then the stretch to the canvas. */
  render(gl: WebGLRenderer, scene: Scene, camera: Camera, overlay?: Scene) {
    gl.setRenderTarget(this.target);
    gl.clear();
    gl.render(scene, camera);
    if (overlay) {
      const auto = gl.autoClear;
      gl.autoClear = false;
      gl.clearDepth();
      gl.render(overlay, camera);
      gl.autoClear = auto;
    }
    gl.setRenderTarget(null);
    gl.render(this.postScene, this.postCam);
  }
}
