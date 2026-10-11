import assert from "node:assert/strict";
import test from "node:test";
import {
  canAnswerVoice, isVoiceCallInfo, isVoiceRoster, isVoiceStatus,
  shouldInitiateVoice, VOICE_CALL_KIND, VOICE_OFF, type VoiceMember,
} from "../src/game/voiceProtocol.ts";

const members: VoiceMember[] = [
  { peerId: "a", name: "One", sessionId: "session-a", muted: false },
  { peerId: "b", name: "Two", sessionId: "session-b", muted: false },
  { peerId: "c", name: "Three", sessionId: null, muted: true },
];
const metadata = {
  kind: VOICE_CALL_KIND,
  room: "ABC123",
  fromSession: "session-a",
  toSession: "session-b",
};

test("each pair has exactly one caller, including guest-to-guest pairs", () => {
  for (const a of ["a", "b", "c", "host"]) {
    for (const b of ["a", "b", "c", "host"]) {
      assert.equal(Number(shouldInitiateVoice(a, b)) + Number(shouldInitiateVoice(b, a)), a === b ? 0 : 1);
    }
  }
});

test("admitted players who both joined voice can connect", () => {
  assert.equal(canAnswerVoice("b", "session-b", "ABC123", members, "a", metadata), true);
});

test("an unknown caller cannot receive the local microphone", () => {
  assert.equal(canAnswerVoice("b", "session-b", "ABC123", members, "attacker", metadata), false);
  assert.equal(canAnswerVoice("b", "session-b", "ABC123", [], "a", metadata), false);
});

test("no microphone is shared when the receiving player has not opted in", () => {
  assert.equal(canAnswerVoice("b", null, "ABC123", members, "a", metadata), false);
  const off = members.map((member) => member.peerId === "b" ? { ...member, ...VOICE_OFF } : member);
  assert.equal(canAnswerVoice("b", "session-b", "ABC123", off, "a", metadata), false);
});

test("a caller that left voice is no longer authorized", () => {
  const off = members.map((member) => member.peerId === "a" ? { ...member, ...VOICE_OFF } : member);
  assert.equal(canAnswerVoice("b", "session-b", "ABC123", off, "a", metadata), false);
});

test("mute keeps the voice connection available for listening", () => {
  const muted = members.map((member) => ({ ...member, muted: true }));
  assert.equal(canAnswerVoice("b", "session-b", "ABC123", muted, "a", metadata), true);
});

test("offers for another room or an earlier consent session are rejected", () => {
  assert.equal(canAnswerVoice("b", "session-b", "OTHER1", members, "a", metadata), false);
  assert.equal(canAnswerVoice("b", "session-b", "ABC123", members, "a", { ...metadata, fromSession: "old" }), false);
  assert.equal(canAnswerVoice("b", "session-b", "ABC123", members, "a", { ...metadata, toSession: "old" }), false);
});

test("duplicate reverse-direction calls are rejected", () => {
  assert.equal(canAnswerVoice("a", "session-a", "ABC123", members, "b", {
    ...metadata, fromSession: "session-b", toSession: "session-a",
  }), false);
});

test("voice rosters have at most four unique room peers", () => {
  assert.equal(isVoiceRoster(members), true);
  assert.equal(isVoiceRoster([...members, members[0]]), false);
  assert.equal(isVoiceRoster(Array.from({ length: 5 }, (_, i) => ({ ...members[0], peerId: `p${i}` }))), false);
});

test("malformed voice status and call metadata are ignored", () => {
  assert.equal(isVoiceStatus(VOICE_OFF), true);
  for (const value of [null, false, {}, { muted: "false", sessionId: "a" }, { muted: false, sessionId: "" }]) {
    assert.equal(isVoiceStatus(value), false);
  }
  assert.equal(isVoiceCallInfo(metadata, "ABC123"), true);
  assert.equal(isVoiceCallInfo({ ...metadata, kind: "other-call" }, "ABC123"), false);
  assert.equal(isVoiceCallInfo({}, "ABC123"), false);
});