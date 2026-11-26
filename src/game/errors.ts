import type { Failure, GameErrorCode } from './types';

/** Builds a failed result. Errors are always returned, never thrown. */
export function fail(code: GameErrorCode, message: string): Failure {
  return { ok: false, error: { code, message } };
}
