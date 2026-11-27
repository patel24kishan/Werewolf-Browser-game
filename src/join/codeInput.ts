import { ROOM_CODE_PATTERN } from '@/net';

/** Uppercases and trims what the player typed. */
export function normalizeCodeInput(raw: string): string {
  return raw.trim().toUpperCase();
}

/** Result of checking a typed code: the code, or a plain-words error. */
export type CodeCheck = { readonly ok: true; readonly code: string } | { readonly ok: false; readonly message: string };

/** Checks the shape of a typed code (not whether a game exists). */
export function validateCodeInput(raw: string): CodeCheck {
  const code = normalizeCodeInput(raw);
  if (code === '') return { ok: false, message: 'Enter the 4-character game code.' };
  if (!ROOM_CODE_PATTERN.test(code)) {
    return {
      ok: false,
      message: code.length < 4 ? 'The code has 4 characters.' : "That doesn't look like a game code. Codes use letters and numbers, without 0, 1, O, I or L.",
    };
  }
  return { ok: true, code };
}
