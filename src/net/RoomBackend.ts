/**
 * The database interface every backend implements (`MemoryBackend` for tests and
 * local demos, `FirebaseBackend` in the real app). SDK-agnostic: plain paths and
 * plain JSON values, shaped after the Firebase Realtime Database API.
 *
 * Paths are slash-separated and relative to the database root, e.g.
 * `rooms/K7QX/players/abc123`. Every segment must pass `isSafeId`; anything else
 * (empty segments, `..`, `__proto__`, spaces, `.`) is rejected with a
 * `BackendError` of code `invalid-path` before anything is read or written.
 *
 * Values are JSON: `null` means absent, and empty objects/arrays are not stored.
 * Data read from a backend is untrusted; parse it defensively (see `roomData.ts`).
 */

/** Stop listening. Safe to call more than once. */
export type Unsubscribe = () => void;

/** A queued on-disconnect write (see `RoomBackend.onDisconnect`). */
export interface DisconnectHandle {
  /** Cancels the queued write. Resolves once the backend has dropped it. */
  cancel(): Promise<void>;
}

/** The backend contract used by `createRoom` and the room service. */
export interface RoomBackend {
  /** Signs this client in as a guest and resolves with its guest id (a safe id). */
  signIn(): Promise<string>;

  /**
   * Atomically creates `rooms/{code}/meta` with `meta` only if it does not exist.
   * Resolves `true` only when this call created it, `false` when the code is taken.
   * Rejects (`invalid-code`) when `code` does not match `ROOM_CODE_PATTERN`.
   */
  claimRoom(code: string, meta: Readonly<Record<string, unknown>>): Promise<boolean>;

  /** Reads the current value at `path`, or `null` when absent. */
  read(path: string): Promise<unknown>;

  /**
   * Listens to the value at `path`. `onValue` fires once with the current value
   * (or `null`), then again whenever the value changes, whether the change
   * came from this client or another one and whether it was written at `path`,
   * below it or above it. It does not fire for writes that leave the value equal.
   * `onError` fires if the backend stops the listener (e.g. permission denied).
   *
   * @throws BackendError (`invalid-path`) synchronously for an invalid path.
   */
  subscribe(path: string, onValue: (value: unknown) => void, onError?: (error: Error) => void): Unsubscribe;

  /**
   * Atomic multi-path write: every `path → value` pair is applied together or
   * none is. `null` deletes. No path may be an ancestor of another in the same
   * update. An invalid path or value rejects the whole update.
   */
  update(writes: Readonly<Record<string, unknown>>): Promise<void>;

  /** Deletes the value at `path` (same as `update({ [path]: null })`). */
  remove(path: string): Promise<void>;

  /**
   * Queues `value` to be written at `path` when this client disconnects (tab
   * closed, crashed or offline). Resolves once the backend has registered it.
   */
  onDisconnect(path: string, value: unknown): Promise<DisconnectHandle>;
}
