# Pale Hours

A 1v4 asymmetric horror game that runs in your browser. One killer, four survivors, a long foggy night.

Peer to peer. The killer's browser hosts the match, so there's no server to pay for.

**Status:** early development. See `SPEC.md` for the design and roadmap.

## Stack

- **Sim:** Go, compiled to WebAssembly
- **Client:** TypeScript, Vite, Three.js
- **Networking:** WebRTC data channels
- **Hosting:** one Cloudflare Worker serves the page and the room-code signaling at https://palehours.ranisaro.com

## License

Code is licensed under AGPL-3.0. See `LICENSE`.

The Pale Hours name, art, audio, characters, and maps are all rights reserved and are not covered by the AGPL.