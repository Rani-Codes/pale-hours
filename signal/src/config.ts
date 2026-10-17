// Tunable signaling numbers.
export const config = {
  codeLength: 4, // room codes are read aloud
  maxPeers: 5, // the killer plus four survivors
  attachWithinMs: 30_000, // a peer must open its event socket this soon after creating or joining
  maxPending: 64, // messages held for a peer whose socket is not open yet
  heartbeatMs: 25_000, // keeps idle sockets under Cloudflare's 100 s proxy timeout
  maxSignalBytes: 64 << 10,
};
