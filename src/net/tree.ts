/**
 * Backend paths and JSON values: validation, copy-on-write tree updates and
 * canonical comparison. Shared by every `RoomBackend` implementation so they all
 * accept and reject exactly the same paths and values.
 *
 * Values follow Firebase Realtime Database semantics: `null` means "absent", and
 * empty objects and arrays are not stored (they read back as `null`).
 */
import { hasOwn, isSafeId } from '@/game';
import { BackendError } from './errors';

/** A value the database can store. Objects are null-prototype and frozen once stored. */
export type JsonValue = null | boolean | number | string | readonly JsonValue[] | JsonObject;

/** A stored object node. */
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

/** Most segments a path may have. */
export const MAX_PATH_SEGMENTS = 32;
/** Deepest nesting a written value may have. */
export const MAX_VALUE_DEPTH = 32;
/** Longest path string accepted. */
export const MAX_PATH_LENGTH = 768;

/**
 * Splits and validates a slash-separated path relative to the database root.
 * Every segment must pass `isSafeId` (letters, digits, `_`, `-`; no `..`, no
 * empty segments, no `__proto__`-style names). The root itself is not a valid path.
 *
 * @throws BackendError with code `invalid-path`.
 */
export function parsePath(path: unknown): string[] {
  if (typeof path !== 'string' || path.length === 0 || path.length > MAX_PATH_LENGTH) {
    throw new BackendError('invalid-path', 'A path must be a non-empty string.');
  }
  const segments = path.split('/');
  if (segments.length > MAX_PATH_SEGMENTS) {
    throw new BackendError('invalid-path', `Path "${path}" is too deep.`);
  }
  for (const segment of segments) {
    if (!isSafeId(segment)) {
      throw new BackendError('invalid-path', `Path "${path}" has an invalid segment.`);
    }
  }
  return segments;
}

/** True if `a` equals `b` or is an ancestor of it (segment-wise). */
export function isPrefixPath(a: readonly string[], b: readonly string[]): boolean {
  if (a.length > b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** True if one path is the other or an ancestor/descendant of it. */
export function pathsOverlap(a: readonly string[], b: readonly string[]): boolean {
  return isPrefixPath(a, b) || isPrefixPath(b, a);
}

/** True for a stored (or plain) object node. */
export function isObjectNode(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function newNode(): Record<string, JsonValue> {
  return Object.create(null) as Record<string, JsonValue>;
}

function isPlainPrototype(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
}

/**
 * Deep-copies untrusted data into a storable value: null-prototype frozen
 * objects with safe keys, frozen arrays, finite numbers, strings and booleans.
 * `null` children are dropped and empty objects/arrays collapse to `null`.
 *
 * @throws BackendError with code `invalid-value` for anything else (undefined,
 *   functions, NaN/Infinity, class instances, unsafe keys, null array items,
 *   nesting deeper than `MAX_VALUE_DEPTH`).
 */
export function sanitizeValue(value: unknown, depth = 0): JsonValue {
  if (depth > MAX_VALUE_DEPTH) throw new BackendError('invalid-value', 'Value is nested too deeply.');
  if (value === null) return null;
  switch (typeof value) {
    case 'boolean':
    case 'string':
      return value;
    case 'number':
      if (!Number.isFinite(value)) throw new BackendError('invalid-value', 'Numbers must be finite.');
      return value;
    case 'object':
      break;
    default:
      throw new BackendError('invalid-value', `Values of type "${typeof value}" cannot be stored.`);
  }
  if (Array.isArray(value)) {
    const items: JsonValue[] = [];
    for (let i = 0; i < value.length; i++) {
      if (!hasOwn(value, String(i))) throw new BackendError('invalid-value', 'Arrays must not have holes.');
      const item = sanitizeValue(value[i], depth + 1);
      if (item === null) throw new BackendError('invalid-value', 'Arrays must not contain null.');
      items.push(item);
    }
    return items.length === 0 ? null : Object.freeze(items);
  }
  const obj = value as object;
  if (!isPlainPrototype(obj)) throw new BackendError('invalid-value', 'Only plain objects can be stored.');
  const out = newNode();
  let count = 0;
  for (const key of Object.keys(obj)) {
    if (!isSafeId(key)) throw new BackendError('invalid-value', 'Object keys must be safe ids.');
    const child = sanitizeValue((obj as Record<string, unknown>)[key], depth + 1);
    if (child !== null) {
      out[key] = child;
      count++;
    }
  }
  return count === 0 ? null : Object.freeze(out);
}

/** The value at `segments` under `root`, or `null` when absent. Never throws. */
export function getAt(root: JsonValue, segments: readonly string[]): JsonValue {
  let node: JsonValue = root;
  for (const segment of segments) {
    if (!isObjectNode(node) || !hasOwn(node, segment)) return null;
    node = node[segment];
  }
  return node;
}

function setIn(node: JsonValue, segments: readonly string[], index: number, value: JsonValue): JsonValue {
  if (index === segments.length) return value;
  const key = segments[index];
  const current = isObjectNode(node) ? node : null;
  const child = current !== null && hasOwn(current, key) ? current[key] : null;
  const next = setIn(child, segments, index + 1, value);
  if (next === child && current !== null) return current;
  const out = newNode();
  let count = 0;
  if (current !== null) {
    for (const k of Object.keys(current)) {
      if (k === key) continue;
      out[k] = current[k];
      count++;
    }
  }
  if (next !== null) {
    out[key] = next;
    count++;
  }
  return count === 0 ? null : Object.freeze(out);
}

/**
 * Returns a new root with `value` stored at `segments` (copy-on-write: `root` is
 * not modified, unchanged branches are shared). `null` deletes, and parents left
 * empty are pruned. Writing below a non-object replaces it with an object.
 * `value` must already be sanitized.
 */
export function setAt(root: JsonObject, segments: readonly string[], value: JsonValue): JsonObject {
  const next = setIn(root, segments, 0, value);
  return isObjectNode(next) ? next : EMPTY_ROOT;
}

/** The empty database. */
export const EMPTY_ROOT: JsonObject = Object.freeze(newNode());

/** JSON with object keys sorted, so equal values always give equal strings. */
export function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const obj = value as JsonObject;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
}

/** One validated write: a path and its new value (`null` deletes). */
export interface Write {
  readonly path: string;
  readonly segments: readonly string[];
  readonly value: JsonValue;
}

/**
 * Validates a multi-path update object. Every key must be a valid path, no path
 * may be an ancestor of another (as in Firebase), and every value must be
 * storable (`null` deletes).
 *
 * @throws BackendError (`invalid-path` / `invalid-value`) on the first problem;
 *   callers rely on this to reject the whole update before writing anything.
 */
export function normalizeWrites(update: unknown): Write[] {
  if (!isObjectNode(update) || !isPlainPrototype(update)) {
    throw new BackendError('invalid-value', 'An update must be a plain object of path → value.');
  }
  const writes: Write[] = [];
  for (const path of Object.keys(update)) {
    const segments = parsePath(path);
    const value = sanitizeValue((update as Record<string, unknown>)[path]);
    for (const other of writes) {
      if (pathsOverlap(other.segments, segments)) {
        throw new BackendError('invalid-path', `Paths "${other.path}" and "${path}" overlap.`);
      }
    }
    writes.push({ path: segments.join('/'), segments, value });
  }
  return writes;
}
