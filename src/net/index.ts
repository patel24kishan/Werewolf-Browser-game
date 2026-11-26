/**
 * Werewolf Companion networking: the `RoomBackend` interface, the in-memory
 * backend, room codes, room creation and the room service.
 */
export type { DisconnectHandle, RoomBackend, Unsubscribe } from './RoomBackend';
export { BackendError, type BackendErrorCode } from './errors';
export {
  DEFAULT_CHANNEL_NAME,
  GUEST_ID_STORAGE_KEY,
  MemoryBackend,
  type BroadcastChannelLike,
  type LockManagerLike,
  type MemoryBackendOptions,
  type StorageLike,
} from './MemoryBackend';
export {
  ALPHABET,
  ROOM_CODE_LENGTH,
  ROOM_CODE_PATTERN,
  isRoomCode,
  joinUrl,
  newRoomCode,
  type RandomBytes,
} from './roomCode';
export { CREATE_ROOM_ATTEMPTS, RoomCodeUnavailableError, createRoom, type CreateRoomOptions } from './createRoom';
export {
  cryptoRng,
  openRoom,
  type DispatchResult,
  type OpenRoomOptions,
  type Room,
  type RoomAction,
  type RoomError,
  type RoomErrorCode,
  type RoomView,
} from './room';
export {
  HOST_ONLY_SECTIONS,
  ROOM_SECTIONS,
  metaFieldPath,
  nightKilledPath,
  nightLockedPath,
  playerEntryPath,
  playerFieldPath,
  roomRoot,
  sectionPath,
  type PerPlayerSection,
  type PlayerField,
  type RoomSection,
} from './paths';
export { buildRoomState, diffRoomState, type RawRoom } from './roomData';
export { parsePath, type JsonValue } from './tree';
export { getBackend } from './backend';
