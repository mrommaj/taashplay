export interface VoiceStatus {
  sessionId: string | null;
  muted: boolean;
}

export interface VoiceMember extends VoiceStatus {
  peerId: string;
  name: string;
}

export const VOICE_OFF: VoiceStatus = { sessionId: null, muted: true };
export const VOICE_CALL_KIND = "rang-room-voice-v1";

export interface VoiceCallInfo {
  kind: typeof VOICE_CALL_KIND;
  room: string;
  fromSession: string;
  toSession: string;
}

export function isVoiceStatus(value: unknown): value is VoiceStatus {
  if (!value || typeof value !== "object") return false;
  const status = value as Record<string, unknown>;
  return typeof status.muted === "boolean" && (
    status.sessionId === null ||
    (typeof status.sessionId === "string" && status.sessionId.length > 0 && status.sessionId.length <= 100)
  );
}

export function isVoiceRoster(value: unknown): value is VoiceMember[] {
  if (!Array.isArray(value) || value.length > 4) return false;
  const ids = new Set<string>();
  return value.every((member: unknown) => {
    if (!isVoiceStatus(member)) return false;
    const item = member as VoiceMember;
    if (typeof item.peerId !== "string" || !item.peerId || item.peerId.length > 150
      || typeof item.name !== "string" || item.name.length > 12 || ids.has(item.peerId)) return false;
    ids.add(item.peerId);
    return true;
  });
}

export function isVoiceCallInfo(value: unknown, room: string): value is VoiceCallInfo {
  if (!value || typeof value !== "object") return false;
  const info = value as Record<string, unknown>;
  return info.kind === VOICE_CALL_KIND && info.room === room
    && typeof info.fromSession === "string" && info.fromSession.length > 0 && info.fromSession.length <= 100
    && typeof info.toSession === "string" && info.toSession.length > 0 && info.toSession.length <= 100;
}

// Only one side dials each pair, including guest-to-guest connections.
export function shouldInitiateVoice(localId: string, remoteId: string): boolean {
  return localId < remoteId;
}

export function canAnswerVoice(
  localId: string,
  localSession: string | null,
  room: string,
  members: VoiceMember[],
  remoteId: string,
  metadata: unknown,
): boolean {
  if (!localSession || !isVoiceCallInfo(metadata, room) || !shouldInitiateVoice(remoteId, localId)) return false;
  const local = members.find((member) => member.peerId === localId);
  const remote = members.find((member) => member.peerId === remoteId);
  return local?.sessionId === localSession && !!remote?.sessionId
    && metadata.toSession === localSession && metadata.fromSession === remote.sessionId;
}