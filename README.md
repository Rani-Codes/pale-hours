# Pale Hours

A 1v4 asymmetric horror game that runs in your browser. One killer, four survivors, a long foggy night.

Peer to peer. The killer's browser hosts the match, so there's no server to pay for.

**Status:** early development. See `SPEC.md` for the design and roadmap.

## Stack

- **Sim:** Go, compiled to WebAssembly
- **Client:** TypeScript, Vite, Three.js
- **Networking:** WebRTC data channels
- **Hosting:** one Cloudflare Worker serves the page and the room-code signaling at https://palehours.ranisaro.com

## Issues

**How it works**

1. Friends post bugs and ideas in the Discord feedback channel.
2. The owner copies the good ones into a GitHub issue using the [Feedback form](https://github.com/Rani-Codes/pale-hours/issues/new?template=feedback.yml).
3. The issue gets the `needs-approval` label on its own.
4. The owner changes the label to `approved` (or closes the issue).
5. Claude Code builds it and opens a pull request. Merging it puts the change live.

**How to set it up**

Nothing to install. To build approved issues, open Claude Code in this repo and run `/build-feedback`.

## License

Code is licensed under AGPL-3.0. See `LICENSE`.

The Pale Hours name, art, audio, characters, and maps are all rights reserved and are not covered by the AGPL.