import assert from "node:assert/strict";
import test from "node:test";
import {
  guestPeerId, JOIN_TIMEOUTS, joinFailureMessage, MAX_JOIN_ATTEMPTS,
  peerOptions, roomUnavailableMessage,
} from "../src/game/connection.ts";

test("each join stage has its own bounded timeout", () => {
  assert.ok(JOIN_TIMEOUTS.signaling > 15000);
  assert.ok(JOIN_TIMEOUTS.peer > 15000);
  assert.ok(JOIN_TIMEOUTS.handshake > 0);
  assert.ok(Object.values(JOIN_TIMEOUTS).every((value) => value <= 45000));
  assert.equal(MAX_JOIN_ATTEMPTS, 3);
});

test("service failures do not claim the host is missing", () => {
  const message = joinFailureMessage("signaling", "ABC123");
  assert.match(message, /connection service/);
  assert.doesNotMatch(message, /[Hh]ost not found/);
});

test("a stalled peer connection differs from a confirmed missing room", () => {
  const timeout = joinFailureMessage("peer", "ABC123");
  const missing = roomUnavailableMessage("ABC123");
  assert.match(timeout, /Could not establish a connection/);
  assert.doesNotMatch(timeout, /not registered/);
  assert.match(missing, /ABC123 is not registered/);
});

test("a received host answer identifies the WebRTC network stage", () => {
  const message = joinFailureMessage("peer", "ABC123", true);
  assert.match(message, /host responded/);
  assert.match(message, /TURN relay/);
  assert.doesNotMatch(message, /host not found/i);
});

test("host confirmation timeout reports the open connection", () => {
  const message = joinFailureMessage("handshake", "ABC123");
  assert.match(message, /connection opened/);
  assert.match(message, /refresh the same site/);
});

test("both sides use secure signaling and Metered UDP, TCP, and TLS relay options", () => {
  const options = peerOptions();
  assert.equal(options.secure, true);
  assert.equal(options.pingInterval, 5000);
  const config = options.config as RTCConfiguration;
  assert.equal(config.iceTransportPolicy, "all");
  assert.deepEqual(config.iceServers?.map((server) => server.urls), [
    "stun:stun.relay.metered.ca:80",
    "turn:standard.relay.metered.ca:80",
    "turn:standard.relay.metered.ca:80?transport=tcp",
    "turn:standard.relay.metered.ca:443",
    "turns:standard.relay.metered.ca:443?transport=tcp",
  ]);
  const relays = config.iceServers!.slice(1);
  for (const relay of relays) {
    assert.equal(typeof relay.username, "string");
    assert.ok(relay.username!.length > 0);
    assert.equal(typeof relay.credential, "string");
    assert.ok(relay.credential!.length > 0);
  }
  assert.equal(new Set(relays.map((relay) => relay.username)).size, 1);
  assert.equal(new Set(relays.map((relay) => relay.credential)).size, 1);
});

test("each peer gets a separate configuration object", () => {
  const first = peerOptions().config as RTCConfiguration;
  const second = peerOptions().config as RTCConfiguration;
  assert.notEqual(first, second);
  assert.notEqual(first.iceServers, second.iceServers);
  first.iceServers!.pop();
  assert.equal(second.iceServers!.length, 5);
});

test("locally allocated guest IDs are valid and unique", () => {
  const ids = new Set(Array.from({ length: 20 }, () => guestPeerId()));
  assert.equal(ids.size, 20);
  for (const id of ids) assert.match(id, /^rang-guest-[a-f0-9]{32}$/);
});