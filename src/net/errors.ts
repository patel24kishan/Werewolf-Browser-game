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
