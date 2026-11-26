/**
 * Room codes and the join link. Starting code: the `lib/roomCode.ts` snippet in
 * `design/companion-architecture.md`, changed to use rejection sampling so every
 * symbol is equally likely (the snippet's `b % 31` favours the first 8 symbols).
 */

/** Code alphabet without look-alikes: no 0, O, 1, I or L. 31 symbols. */
export const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Characters in a room code. */
export const ROOM_CODE_LENGTH = 4;

/** A valid room code: exactly 4 symbols from `ALPHABET`. Check before using a code in a path. */
export const ROOM_CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/;

/** Returns `count` random bytes. Injected in tests; defaults to `crypto.getRandomValues`. */
export type RandomBytes = (count: number) => Uint8Array;

/** Bytes at or above this are rejected: 248 = the largest multiple of 31 that fits in a byte. */
const BYTE_LIMIT = 256 - (256 % ALPHABET.length);

/** Rounds of random bytes before giving up on a broken random source. */
const MAX_ROUNDS = 64;

function cryptoRandomBytes(count: number): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(count));
}

/**
 * A random room code from a CSPRNG, without modulo bias: bytes ≥ 248 are thrown
 * away and the rest map to `ALPHABET[b % 31]`, so each symbol has exactly 8 of
 * the 248 accepted byte values.
 *
 * @param length Symbols in the code (default 4; `ROOM_CODE_PATTERN` only accepts 4).
 * @param randomBytes Random source, `crypto.getRandomValues` by default.
 * @throws RangeError for a bad length, Error if the source keeps returning only rejected bytes.
 */
export function newRoomCode(length: number = ROOM_CODE_LENGTH, randomBytes: RandomBytes = cryptoRandomBytes): string {
  if (!Number.isInteger(length) || length < 1 || length > 64) {
    throw new RangeError('Room code length must be a whole number from 1 to 64.');
  }
  let code = '';
  for (let round = 0; round < MAX_ROUNDS && code.length < length; round++) {
    const bytes = randomBytes(length - code.length);
    if (!(bytes instanceof Uint8Array)) throw new TypeError('randomBytes must return a Uint8Array.');
    for (const b of bytes) {
      if (b >= BYTE_LIMIT) continue;
      code += ALPHABET[b % ALPHABET.length];
      if (code.length === length) break;
    }
  }
  if (code.length < length) throw new Error('The random source kept returning unusable bytes.');
  return code;
}

/** True if `value` is a valid room code. */
export function isRoomCode(value: unknown): value is string {
  return typeof value === 'string' && ROOM_CODE_PATTERN.test(value);
}

/**
 * The join link for a room: `<origin>/join?code=XXXX`.
 *
 * @param origin Site origin, e.g. `https://example.web.app`. Defaults to
 *   `location.origin` in the browser; required elsewhere.
 * @throws Error for an invalid code or when no origin is available.
 */
export function joinUrl(code: string, origin?: string): string {
  if (!isRoomCode(code)) throw new Error(`"${String(code)}" is not a valid room code.`);
  const base = origin ?? (typeof location !== 'undefined' ? location.origin : undefined);
  if (!base) throw new Error('joinUrl needs an origin outside the browser.');
  const url = new URL('/join', base);
  url.searchParams.set('code', code);
  return url.toString();
}
