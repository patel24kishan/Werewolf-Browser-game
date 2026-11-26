/**
 * Creating a game: pick a free room code and claim it. Starting code: the
 * `lib/createRoom.ts` snippet in `design/companion-architecture.md`, moved onto
 * `RoomBackend` so it runs against the memory and Firebase backends alike.
 */
import { newRoomState, type PlayerId } from '@/game';
import { encodeDeck, encodeMeta } from './roomData';
import type { RoomBackend } from './RoomBackend';
import { ROOM_CODE_PATTERN, newRoomCode } from './roomCode';
import { sectionPath } from './paths';

/** How many codes `createRoom` tries before giving up. */
export const CREATE_ROOM_ATTEMPTS = 5;

/** Thrown when every attempted code was already taken. */
export class RoomCodeUnavailableError extends Error {
  constructor() {
    super('Could not find a free game code. Try again.');
    this.name = 'RoomCodeUnavailableError';
  }
}

/** Options for `createRoom`, injectable for tests. */
export interface CreateRoomOptions {
  /** Clock for `meta.createdAt` (ms since the epoch). Default `Date.now`. */
  readonly now?: () => number;
  /** Code generator. Default `newRoomCode()` (CSPRNG, 4 symbols). */
  readonly newCode?: () => string;
}

/**
 * Creates a room hosted by `hostId` and resolves with its code.
 *
 * Tries up to `CREATE_ROOM_ATTEMPTS` (5) random codes; each is claimed with the
 * atomic `claimRoom` (create-if-absent of `rooms/{code}/meta`, holding the
 * initial meta from `newRoomState`). After a successful claim, the rest of the
 * initial room (the deck configuration) is written in one update.
 *
 * @throws RoomCodeUnavailableError when all 5 codes were taken; Error for an
 *   invalid host id or a generator that returns an invalid code.
 */
export async function createRoom(backend: RoomBackend, hostId: PlayerId, opts: CreateRoomOptions = {}): Promise<string> {
  const now = opts.now ?? Date.now;
  const newCode = opts.newCode ?? (() => newRoomCode());
  const initial = newRoomState(hostId, now());
  if (!initial.ok) throw new Error(initial.error.message);
  const meta = encodeMeta(initial.state.meta);

  for (let attempt = 0; attempt < CREATE_ROOM_ATTEMPTS; attempt++) {
    const code = newCode();
    if (!ROOM_CODE_PATTERN.test(code)) throw new Error(`Generated room code "${code}" is invalid.`);
    if (await backend.claimRoom(code, meta)) {
      await backend.update({ [sectionPath(code, 'deck')]: encodeDeck(initial.state.deck) });
      return code;
    }
  }
  throw new RoomCodeUnavailableError();
}
