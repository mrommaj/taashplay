import assert from "node:assert/strict";
import test from "node:test";
import {
  addGuest,
  canStartRoom,
  chooseGuestTeam,
  createLobby,
  getLobbySeats,
  removeGuest,
  type RoomLobby,
  type TeamId,
} from "../src/game/lobby.ts";

function join(lobby: RoomLobby, id: string) {
  const result = addGuest(lobby, id, id);
  assert.equal(result.error, null);
  return result.lobby;
}

function choose(lobby: RoomLobby, id: string, team: TeamId, started = false) {
  const result = chooseGuestTeam(lobby, id, team, started);
  assert.equal(result.error, null);
  return result.lobby;
}

test("joining never assigns a team automatically", () => {
  const lobby = join(createLobby("Host"), "Friend");
  assert.equal(lobby.guests[0].seat, null);
  assert.deepEqual(getLobbySeats(lobby).seatsTaken, [true, false, false, false]);
  assert.deepEqual(getLobbySeats(lobby).pendingNames, ["Friend"]);
  assert.equal(canStartRoom(lobby), false);
});

test("Team A seats a friend opposite the host and leaves two bot places", () => {
  const lobby = choose(join(createLobby("Host"), "Friend"), "Friend", 0);
  assert.equal(lobby.guests[0].seat, 2);
  assert.deepEqual(getLobbySeats(lobby).names, ["Host", "", "Friend", ""]);
  assert.deepEqual(getLobbySeats(lobby).seatsTaken, [true, false, true, false]);
  assert.equal(canStartRoom(lobby), true);
});

test("Team B seats a friend against the host", () => {
  const lobby = choose(join(createLobby("Host"), "Friend"), "Friend", 1);
  assert.equal(lobby.guests[0].seat, 1);
  assert.deepEqual(getLobbySeats(lobby).seatsTaken, [true, true, false, false]);
});

test("two opponents are partners in seats 1 and 3", () => {
  let lobby = choose(join(createLobby("Host"), "One"), "One", 1);
  lobby = choose(join(lobby, "Two"), "Two", 1);
  assert.deepEqual(lobby.guests.map((guest) => guest.seat), [1, 3]);
});

test("a full team rejects a selection without assigning the other team", () => {
  let lobby = choose(join(createLobby("Host"), "Partner"), "Partner", 0);
  lobby = join(lobby, "Other");
  const result = chooseGuestTeam(lobby, "Other", 0, false);
  assert.match(result.error!, /Team A is full/);
  assert.equal(result.lobby, lobby);
  assert.equal(result.lobby.guests[1].seat, null);
});

test("a failed team switch keeps the player's existing seat", () => {
  let lobby = choose(join(createLobby("Host"), "Partner"), "Partner", 0);
  lobby = choose(join(lobby, "One"), "One", 1);
  lobby = choose(join(lobby, "Two"), "Two", 1);
  const result = chooseGuestTeam(lobby, "Partner", 1, false);
  assert.match(result.error!, /Team B is full/);
  assert.deepEqual(result.lobby.guests.map((guest) => guest.seat), [2, 1, 3]);
});

test("switching teams before the start releases the previous seat", () => {
  let lobby = choose(join(createLobby("Host"), "Friend"), "Friend", 1);
  lobby = choose(lobby, "Friend", 0);
  assert.deepEqual(getLobbySeats(lobby).seatsTaken, [true, false, true, false]);
  assert.equal(lobby.guests.length, 1);
});

test("the host must wait for every connected guest to choose", () => {
  assert.equal(canStartRoom(createLobby("Host")), false);
  let lobby = choose(join(createLobby("Host"), "One"), "One", 0);
  lobby = join(lobby, "Two");
  assert.equal(canStartRoom(lobby), false);
  lobby = choose(lobby, "Two", 1);
  assert.equal(canStartRoom(lobby), true);
});

test("duplicate hello and selection messages do not consume extra seats", () => {
  const lobby = choose(join(createLobby("Host"), "Friend"), "Friend", 0);
  const duplicate = addGuest(lobby, "Friend", "Changed name");
  assert.equal(duplicate.lobby, lobby);
  assert.equal(chooseGuestTeam(lobby, "Friend", 0, false).lobby, lobby);
  assert.equal(lobby.guests[0].name, "Friend");
});

test("the room has space for only three guests including those choosing", () => {
  let lobby = createLobby("Host");
  for (const id of ["One", "Two", "Three"]) lobby = join(lobby, id);
  const result = addGuest(lobby, "Four", "Four");
  assert.match(result.error!, /full/);
  assert.equal(result.lobby.guests.length, 3);
});

test("unknown players and invalid team values cannot claim a seat", () => {
  const lobby = join(createLobby("Host"), "Friend");
  assert.notEqual(chooseGuestTeam(lobby, "Unknown", 0, false).error, null);
  for (const team of [-1, 2, "0", null, undefined, {}]) {
    const result = chooseGuestTeam(lobby, "Friend", team, false);
    assert.notEqual(result.error, null);
    assert.equal(result.lobby, lobby);
  }
});

test("players cannot switch teams after seeing their cards", () => {
  const lobby = choose(join(createLobby("Host"), "Friend"), "Friend", 0);
  const result = chooseGuestTeam(lobby, "Friend", 1, true);
  assert.match(result.error!, /locked/);
  assert.equal(result.lobby, lobby);
  assert.equal(chooseGuestTeam(lobby, "Friend", 0, true).error, null);
});

test("a late guest can choose a bot place but not change after that", () => {
  let lobby = choose(join(createLobby("Host"), "Partner"), "Partner", 0);
  lobby = join(lobby, "Late");
  lobby = choose(lobby, "Late", 1, true);
  assert.equal(lobby.guests[1].seat, 1);
  assert.notEqual(chooseGuestTeam(lobby, "Late", 0, true).error, null);
});

test("disconnecting frees only that player's place", () => {
  let lobby = choose(join(createLobby("Host"), "Partner"), "Partner", 0);
  lobby = choose(join(lobby, "Opponent"), "Opponent", 1);
  lobby = removeGuest(lobby, "Partner");
  assert.deepEqual(getLobbySeats(lobby).seatsTaken, [true, true, false, false]);
  lobby = choose(join(lobby, "New"), "New", 0);
  assert.deepEqual(lobby.guests.map((guest) => guest.seat), [1, 2]);
});

test("leaving while choosing does not block the host's start button", () => {
  let lobby = choose(join(createLobby("Host"), "Ready"), "Ready", 0);
  lobby = join(lobby, "Choosing");
  lobby = removeGuest(lobby, "Choosing");
  assert.equal(canStartRoom(lobby), true);
  assert.deepEqual(getLobbySeats(lobby).pendingNames, []);
});

test("back-to-back requests for the last place never create duplicate seats", () => {
  let lobby = join(join(createLobby("Host"), "One"), "Two");
  lobby = choose(lobby, "One", 0);
  const result = chooseGuestTeam(lobby, "Two", 0, false);
  assert.notEqual(result.error, null);
  assert.deepEqual(result.lobby.guests.map((guest) => guest.seat), [2, null]);
});