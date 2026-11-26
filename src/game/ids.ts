/**
 * Safe ids and own-property helpers.
 *
 * Player ids become object keys (and database path segments), so every id is
 * checked before it is written, and reads use own-property lookups so inherited
 * members such as `toString` never look like players.
 */

/** Letters, digits, `_` and `-`, 1 to 128 characters. Also safe as a Firebase key. */
const SAFE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/** Names that would collide with `Object.prototype` members. */
const RESERVED_IDS: ReadonlySet<string> = new Set([
  '__proto__',
  'constructor',
  'prototype',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toString',
  'toLocaleString',
  'valueOf',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
]);

/** True if `value` is a string usable as a player id / object key. */
export function isSafeId(value: unknown): value is string {
  return typeof value === 'string' && SAFE_ID_PATTERN.test(value) && !RESERVED_IDS.has(value);
}

/** True if `obj` has `key` as its own property (never inherited). */
export function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/** Reads `record[key]` only when it is an own property. */
export function getOwn<T>(record: Readonly<Record<string, T>>, key: string): T | undefined {
  return hasOwn(record, key) ? record[key] : undefined;
}

/**
 * Reads `record[key]` only when it is an own property holding an object, so a
 * malformed entry (null, a number) from storage reads as missing.
 */
export function getOwnRecord<T extends object>(record: Readonly<Record<string, T>>, key: string): T | undefined {
  const value = getOwn(record, key);
  return isPlainObject(value) ? value : undefined;
}

/** Own keys of `record` that are safe ids, in ordinal (code unit) order. */
export function safeKeys(record: object): string[] {
  return Object.keys(record).filter(isSafeId).sort(compareOrdinal);
}

/** Ordinal string comparison (same as C# `string.CompareOrdinal`). */
export function compareOrdinal(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** True for a non-null, non-array object. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
