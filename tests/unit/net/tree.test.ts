import { describe, expect, it } from 'vitest';
import { BackendError } from '@/net';
import { EMPTY_ROOT, canonicalJson, getAt, normalizeWrites, parsePath, sanitizeValue, setAt } from '@/net/tree';
import { nightKilledPath, playerEntryPath, playerFieldPath, roomRoot, sectionPath } from '@/net/paths';

function codeOf(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (error) {
    return error instanceof BackendError ? error.code : 'other';
  }
}

describe('path validation', () => {
  it('accepts slash-separated safe segments', () => {
    expect(parsePath('rooms/K7QX/players/p_01-x')).toEqual(['rooms', 'K7QX', 'players', 'p_01-x']);
  });

  it('rejects empty, traversal, prototype and odd segments', () => {
    const bad = [
      '', '/', '/rooms', 'rooms/', 'rooms//K7QX', '..', 'rooms/../x', '.', 'rooms/./x',
      '__proto__', 'rooms/__proto__', 'rooms/constructor/x', 'rooms/prototype', 'a b', 'a.b', 'a$b',
      'a#b', 'a[0]', `${'a/'.repeat(40)}a`, 'x'.repeat(800),
    ];
    for (const path of bad) expect(codeOf(() => parsePath(path))).toBe('invalid-path');
    for (const notString of [null, undefined, 7, ['rooms']]) expect(codeOf(() => parsePath(notString))).toBe('invalid-path');
  });

  it('room path builders validate the code and ids', () => {
    expect(sectionPath('K7QX', 'night')).toBe('rooms/K7QX/night');
    expect(playerFieldPath('K7QX', 'p1', 'connected')).toBe('rooms/K7QX/players/p1/connected');
    expect(codeOf(() => roomRoot('k7qx'))).toBe('invalid-code');
    expect(codeOf(() => roomRoot('K7QX/players'))).toBe('invalid-code');
    expect(codeOf(() => playerEntryPath('K7QX', 'cards', '__proto__'))).toBe('invalid-path');
    expect(codeOf(() => playerEntryPath('K7QX', 'cards', '../meta'))).toBe('invalid-path');
    expect(codeOf(() => nightKilledPath('K7QX', 'a/b'))).toBe('invalid-path');
    expect(codeOf(() => sectionPath('K7QX', 'secret' as never))).toBe('invalid-path');
    expect(codeOf(() => playerFieldPath('K7QX', 'p1', 'role' as never))).toBe('invalid-path');
  });
});

describe('values', () => {
  it('stores JSON, drops nulls and collapses empty containers', () => {
    const v = sanitizeValue({ a: 1, b: null, c: {}, d: [], e: { f: 'x' }, g: [1, 'y', true] });
    expect(v).toEqual({ a: 1, e: { f: 'x' }, g: [1, 'y', true] });
    expect(Object.getPrototypeOf(v)).toBeNull();
    expect(Object.isFrozen(v)).toBe(true);
    expect(sanitizeValue({})).toBeNull();
  });

  it('rejects non-JSON values and unsafe keys', () => {
    for (const bad of [undefined, NaN, Infinity, () => 1, Symbol('s'), 10n, new Date(), new Map(), [1, null], [1, , 2]]) {
      expect(codeOf(() => sanitizeValue(bad))).toBe('invalid-value');
    }
    expect(codeOf(() => sanitizeValue(JSON.parse('{"__proto__":{"polluted":true}}')))).toBe('invalid-value');
    expect(codeOf(() => sanitizeValue({ 'a/b': 1 }))).toBe('invalid-value');
    let deep: unknown = 1;
    for (let i = 0; i < 40; i++) deep = { x: deep };
    expect(codeOf(() => sanitizeValue(deep))).toBe('invalid-value');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('setAt is copy-on-write and prunes empty parents', () => {
    const a = setAt(EMPTY_ROOT, ['r', 'x', 'y'], 1);
    const b = setAt(a, ['r', 'z'], 2);
    expect(getAt(a, ['r', 'z'])).toBeNull();
    expect(getAt(b, ['r'])).toEqual({ x: { y: 1 }, z: 2 });
    const c = setAt(b, ['r', 'x', 'y'], null);
    expect(getAt(c, ['r'])).toEqual({ z: 2 });
    expect(setAt(c, ['r', 'z'], null)).toEqual({});
    // writing below a leaf replaces it
    expect(getAt(setAt(b, ['r', 'z', 'deep'], true), ['r', 'z'])).toEqual({ deep: true });
  });

  it('canonical JSON ignores key order', () => {
    expect(canonicalJson(sanitizeValue({ b: 1, a: { d: 2, c: 3 } }))).toBe(canonicalJson(sanitizeValue({ a: { c: 3, d: 2 }, b: 1 })));
  });

  it('normalizeWrites rejects overlapping paths', () => {
    expect(codeOf(() => normalizeWrites({ 'a/b': 1, a: 2 }))).toBe('invalid-path');
    expect(codeOf(() => normalizeWrites({ 'a/b': 1, 'a/b/c': 2 }))).toBe('invalid-path');
    expect(normalizeWrites({ 'a/b': 1, 'a/bc': 2 })).toHaveLength(2);
  });
});
