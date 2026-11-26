/**
 * Player name rules: trimmed, 1–12 characters (Unicode code points), no control
 * characters, unique case-insensitively within a room.
 */
import { fail } from './errors';
import { getOwnRecord, safeKeys } from './ids';
import { NAME_MAX_LENGTH, NAME_MIN_LENGTH } from './rules';
import type { NameResult, PlayerId, PlayerRecord } from './types';

function hasControlCharacter(text: string): boolean {
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}

/** Trims `raw` and checks the length and character rules. */
export function normalizeName(raw: unknown): NameResult {
  if (typeof raw !== 'string') return fail('invalid-name', 'Name must be text.');
  const name = raw.trim();
  const length = Array.from(name).length;
  if (length < NAME_MIN_LENGTH || length > NAME_MAX_LENGTH) {
    return fail(
      'invalid-name',
      `Name must be ${NAME_MIN_LENGTH} to ${NAME_MAX_LENGTH} characters.`,
    );
  }
  if (hasControlCharacter(name)) return fail('invalid-name', 'Name contains a control character.');
  return { ok: true, name };
}

/** The key two names are compared by (case-insensitive). */
export function nameKey(name: string): string {
  return name.toLowerCase();
}

/**
 * True if another player (anyone except `exceptId`) already uses `name`,
 * compared case-insensitively.
 */
export function isNameTaken(
  players: Readonly<Record<PlayerId, PlayerRecord>>,
  name: string,
  exceptId: PlayerId | null,
): boolean {
  const key = nameKey(name);
  return safeKeys(players).some((id) => {
    if (id === exceptId) return false;
    const record = getOwnRecord(players, id);
    return record !== undefined && typeof record.name === 'string' && nameKey(record.name) === key;
  });
}
