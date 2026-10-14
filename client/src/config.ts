// Tunable client-side numbers. Sim tunables live in sim/config.go.
export const net = {
  signalUrl: "http://localhost:8787",
  stunServers: ["stun:stun.cloudflare.com:3478"],
  // Unreliable, unordered: a late input or snapshot is worthless, never retransmit.
  stateChannel: { ordered: false, maxRetransmits: 0 } as RTCDataChannelInit,
  pingIntervalMs: 500,
};
