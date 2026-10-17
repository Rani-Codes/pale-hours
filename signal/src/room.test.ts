import { test } from "node:test";
import assert from "node:assert/strict";
import { Room, type Message, type Socket } from "./room.ts";

function setup(maxPeers = 4) {
  const timers: (() => void)[] = [];
  let closed = 0;
  const room = new Room({
    maxPeers,
    attachWithinMs: 30_000,
    maxPending: 64,
    after: (_ms, f) => timers.push(f),
    onClose: () => closed++,
  });
  return { room, fireTimers: () => timers.splice(0).forEach((f) => f()), closed: () => closed };
}

function socket() {
  const got: Message[] = [];
  const s: Socket & { got: Message[]; ended: boolean } = {
    got,
    ended: false,
    send: (m) => got.push(m),
    close: () => (s.ended = true),
  };
  return s;
}

test("room lifecycle: join, welcome, relay, leave", () => {
  const { room } = setup();
  const host = socket();
  room.attach(room.host, host);
  const guestId = room.join();
  assert.equal(typeof guestId, "string");
  assert.equal(guestId.length, 8);
  assert.deepEqual(host.got, [{ type: "peer-joined", from: guestId }]);

  const guest = socket();
  room.attach(guestId, guest);
  assert.deepEqual(guest.got, [{ type: "welcome", host: room.host }]);

  assert.equal(room.relay(guestId, room.host, { sdp: "x" }), true);
  assert.deepEqual(host.got.at(-1), { type: "signal", from: guestId, data: { sdp: "x" } });

  room.detach(guestId, guest);
  assert.deepEqual(host.got.at(-1), { type: "peer-left", from: guestId });
});

test("room errors: full room and unknown peers", () => {
  const { room } = setup(2);
  assert.equal(typeof room.join(), "string");
  assert.equal(room.join(), "room-full");
  assert.equal(room.relay(room.host, "ghost", 1), false);
  assert.equal(room.relay("ghost", room.host, 1), false);
  assert.equal(room.attach("ghost", socket()), false);
});

test("host leaving closes the room for everyone", () => {
  const { room, closed } = setup();
  const host = socket();
  room.attach(room.host, host);
  const guestId = room.join() as string;
  const guest = socket();
  room.attach(guestId, guest);
  room.detach(room.host, host);
  assert.deepEqual(guest.got.at(-1), { type: "room-closed" });
  assert.equal(guest.ended, true);
  assert.equal(closed(), 1);
  assert.equal(room.attach(guestId, socket()), false);
});

test("peers that never open a socket are dropped", () => {
  const { room, fireTimers, closed } = setup();
  const host = socket();
  room.attach(room.host, host);
  const lurker = room.join() as string;
  fireTimers();
  assert.deepEqual(host.got, [{ type: "peer-joined", from: lurker }, { type: "peer-left", from: lurker }]);
  assert.equal(closed(), 0);

  const idle = setup();
  idle.fireTimers();
  assert.equal(idle.closed(), 1);
});

test("expiry after a normal leave is harmless", () => {
  const { room, fireTimers, closed } = setup();
  const host = socket();
  room.attach(room.host, host);
  const guestId = room.join() as string;
  const guest = socket();
  room.attach(guestId, guest);
  room.detach(guestId, guest);
  const seen = host.got.length;
  fireTimers();
  assert.equal(host.got.length, seen);
  assert.equal(closed(), 0);
});

test("a replaced socket closing does not remove the peer", () => {
  const { room } = setup();
  const first = socket();
  const second = socket();
  room.attach(room.host, first);
  room.attach(room.host, second);
  assert.equal(first.ended, true);
  room.detach(room.host, first);
  assert.equal(typeof room.join(), "string");
  assert.equal(second.got.length, 1);
});
