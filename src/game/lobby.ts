export type TeamId = 0 | 1;

export const TEAM_SEATS = [[0, 2], [1, 3]] as const;

export interface LobbyGuest {
  id: string;
  name: string;
  seat: number | null;
}

export interface RoomLobby {
  hostName: string;
  guests: LobbyGuest[];
}

interface LobbyResult {
  lobby: RoomLobby;
  error: string | null;
}

export function createLobby(hostName: string): RoomLobby {
  return { hostName, guests: [] };
}

export function addGuest(lobby: RoomLobby, id: string, name: string): LobbyResult {
  if (lobby.guests.some((guest) => guest.id === id)) return { lobby, error: null };
  if (lobby.guests.length >= 3) {
    return { lobby, error: "This room is full. There is space for four people including the host." };
  }
  return {
    lobby: {
      ...lobby,
      guests: [...lobby.guests, { id, name: name.trim().slice(0, 12) || "Player", seat: null }],
    },
    error: null,
  };
}

export function chooseGuestTeam(
  lobby: RoomLobby,
  id: string,
  team: unknown,
  started: boolean,
): LobbyResult {
  if (team !== 0 && team !== 1) return { lobby, error: "Choose Team A or Team B." };
  const guest = lobby.guests.find((member) => member.id === id);
  if (!guest) return { lobby, error: "Please join the room before choosing a team." };

  if (guest.seat !== null && guest.seat % 2 === team) return { lobby, error: null };
  if (started && guest.seat !== null) {
    return { lobby, error: "Teams are locked once the game starts." };
  }

  const occupied = new Set(lobby.guests.filter((member) => member.id !== id).map((member) => member.seat));
  const seat = TEAM_SEATS[team].find((candidate) => candidate !== 0 && !occupied.has(candidate));
  if (seat === undefined) {
    return { lobby, error: `Team ${team === 0 ? "A" : "B"} is full. Choose the other team or wait for a place.` };
  }

  return {
    lobby: {
      ...lobby,
      guests: lobby.guests.map((member) => member.id === id ? { ...member, seat } : member),
    },
    error: null,
  };
}

export function removeGuest(lobby: RoomLobby, id: string): RoomLobby {
  return { ...lobby, guests: lobby.guests.filter((guest) => guest.id !== id) };
}

export function getLobbySeats(lobby: RoomLobby) {
  const names = [lobby.hostName, "", "", ""];
  const seatsTaken = [true, false, false, false];
  for (const guest of lobby.guests) {
    if (guest.seat !== null) {
      names[guest.seat] = guest.name;
      seatsTaken[guest.seat] = true;
    }
  }
  return {
    names,
    seatsTaken,
    connected: [...seatsTaken],
    pendingNames: lobby.guests.filter((guest) => guest.seat === null).map((guest) => guest.name),
  };
}

export function canStartRoom(lobby: RoomLobby): boolean {
  return lobby.guests.length > 0 && lobby.guests.every((guest) => guest.seat !== null);
}