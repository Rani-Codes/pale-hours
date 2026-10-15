// Tunable client-side numbers. Sim tunables live in sim/config.go.
const params = new URLSearchParams(globalThis.location?.search);

export const net = {
  signalUrl: params.get("signal") ?? "http://localhost:8787", // ?signal= points a test instance at its own server
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

// Simulated bad network for testing, applied to everything this tab sends:
// ?delay=100&jitter=20&loss=0.05. Delay is one way, so round trip grows by twice it.
// Loss and jitter apply only to the unreliable channel; the reliable one just gets the delay.
export const lagSim = {
  delayMs: Number(params.get("delay") ?? 0),
  jitterMs: Number(params.get("jitter") ?? 0),
  loss: Number(params.get("loss") ?? 0),
};

// Spawn points in meters. The killer hosts and is always player 1; guests take 2 to 5.
export const spawns = {
  killer: { x: -10, y: 0 },
  survivors: [
    { x: 10, y: 0 },
    { x: 10, y: 4 },
    { x: 10, y: -4 },
    { x: 14, y: 0 },
  ],
};
