/** Why a backend call was rejected. */
export type BackendErrorCode =
  | 'invalid-path'
  | 'invalid-value'
  | 'invalid-code'
  | 'closed'
  | 'timeout'
  | 'rejected';

/** Error thrown (as a rejected promise) by `RoomBackend` implementations. */
export class BackendError extends Error {
  /** Machine-readable reason. */
  readonly code: BackendErrorCode;

  constructor(code: BackendErrorCode, message: string) {
    super(message);
    this.name = 'BackendError';
    this.code = code;
  }
}

/**
 * Thrown by `getBackend` when the Firebase backend is selected but its web
 * config is incomplete. `missing` lists the environment variable names (never
 * their values), so the UI can show a clear setup message.
 */
export class BackendNotConfiguredError extends Error {
  /** Names of the missing `NEXT_PUBLIC_FIREBASE_*` variables. */
  readonly missing: readonly string[];

  constructor(missing: readonly string[]) {
    super(
      `Firebase is not configured: missing ${missing.join(', ')}. ` +
        'Add them to .env.local (see .env.local.example) and rebuild, or set NEXT_PUBLIC_BACKEND=memory.',
    );
    this.name = 'BackendNotConfiguredError';
    this.missing = Object.freeze([...missing]);
  }
}
