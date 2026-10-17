// Tunable client-side numbers. Sim tunables live in sim/config.go.
const params = new URLSearchParams(globalThis.location?.search);

export const net = {
  // The deployed Worker serves the page and signaling on one origin; local dev
  // runs signaling on its own port. ?signal= points a test instance at its own server.
  signalUrl:
    params.get("signal") ??
    (["localhost", "127.0.0.1"].includes(globalThis.location?.hostname) ? "http://localhost:8787" : (globalThis.location?.origin ?? "")),
  stunServers: ["stun:stun.cloudflare.com:3478"],
  // Unreliable, unordered: a late input or snapshot is worthless, never retransmit.
  stateChannel: { ordered: false, maxRetransmits: 0 } as RTCDataChannelInit,
  pingIntervalMs: 500,

  snapshotRate: 30, // host snapshots per second; every tick at the 30 Hz sim
  interpDelayMs: 70, // how far behind the host clock remote players are drawn, plus measured jitter; covers one lost snapshot
  clockSmoothing: 0.05, // weight of each new snapshot when estimating the host clock

  // Guest: every packet resends all unacknowledged inputs, so a lost packet
  // costs nothing as long as a later one arrives.
  maxUnackedInputs: 90, // older inputs are dropped (3 s at 30 Hz)

  // Host, per guest input queue.
  // A spare input covers one late or lost packet. Each stall adds one, so
  // when more than this many spares sit unused for a whole window, drop one.
  inputBacklogWindowTicks: 30,
  inputBacklogSpare: 1,
  maxQueuedInputs: 60, // hard cap; anything beyond is dropped
};

// Camera and look. Angles in degrees, distances in meters.
export const view = {
  mouseSensitivity: 0.0022, // radians per pixel of mouse movement
  maxPitch: 60,
  killer: { fov: 62, eyeHeight: 1.65 }, // narrow on purpose: the killer sees less than survivors
  survivor: { fov: 82, distance: 3.6, height: 2.5, crouchHeight: 1.7, shoulder: 0.5, cameraRadius: 0.25, minDistance: 0.9, cameraEase: 6 }, // the camera stops cameraRadius short of walls, never nearer the player than minDistance, and eases back out at cameraEase m/s
  near: 0.1,
  far: 200,
  // Fog and darkness. Everything past fog.far is the fog colour, so the
  // killer can only be seen up close and survivors cannot see him coming.
  fog: { color: 0x07080a, near: 4, far: 26 },
  // The PS1 look: a low-res image stretched with hard pixels, banded color
  // with an ordered dither, and vertices snapped to the pixel grid.
  retro: { pixelHeight: 240, colorLevels: 24, dither: 1 },
  exit: { roadLength: 22 }, // how far the road past each gate is drawn, in meters; only the first part is walkable
  checkResultMs: 1000, // how long "good" or "missed" stays up after a skill check
  feedMs: 3000, // how long "X escaped" and "X died" stay up
  // A finished generator lights a column and a ring that every player sees, through walls and fog.
  generatorDone: { showMs: 4000, color: 0xff8a2a, opacity: 0.4, columnRadius: 1.3, ringRadius: 16, ringMs: 1400 },
  // Tall grass: stalks per square metre, and how high they stand. A crouched survivor is about 1.2 m tall.
  tallGrass: { density: 14, minHeight: 1.3, maxHeight: 1.8 },
  // When a survivor is hung on a hook, the other survivors see a beam over it this long.
  hookAlert: { showMs: 3000, color: 0xe03c3c },
  // ?light=review: full light and no fog, to judge models and animation. Never for play.
  reviewLight: params.get("light") === "review",
  light: {
    ambient: 0.12, // what the dark leaves you
    moon: 0.25, // faint directional light so shapes read
    lantern: 14, // intensity of the light carried by the viewer
    lanternRange: 22,
    lanternColor: 0xcfd6e6,
  },
};

// Sound. The heartbeat is what a survivor hears when the killer is near.
export const audio = {
  defaultVolume: 0.7, // master volume before the player changes it, 0 to 1
  heartbeat: {
    range: 32, // meters; silent beyond this
    minBpm: 55,
    maxBpm: 160,
    minGain: 0.05,
    maxGain: 0.5,
    lubHz: 105, // mid-low and short: a muffled thud, not sub bass
    dubHz: 88,
    attack: 0.02,
    decay: 0.1,
    lowpassHz: 280,
  },
  // The sound every player hears when a generator finishes, wherever they are:
  // an engine cranking over, catching, and settling into a rattling idle.
  generatorDone: {
    gain: 0.5,
    chugs: 5, // cranking pulses before it catches
    firstChugMs: 230, // gap before the second pulse; each gap after is chugSpeedup times the last
    chugSpeedup: 0.78,
    idleHz: 46, // the engine's note once running
    rattleHz: 15, // how fast the idle shudders
    totalSec: 1.6, // the whole sound, crank to last rattle; the idle fills whatever the cranking leaves
  },
};

// Simulated bad network for testing, applied to everything this tab sends:
// ?delay=100&jitter=20&loss=0.05. Delay is one way, so round trip grows by twice it.
// Loss and jitter apply only to the unreliable channel; the reliable one just gets the delay.
export const lagSim = {
  delayMs: Number(params.get("delay") ?? 0),
  jitterMs: Number(params.get("jitter") ?? 0),
  loss: Number(params.get("loss") ?? 0),
};
