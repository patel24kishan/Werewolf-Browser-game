import { describe, expect, it } from 'vitest';
import { ALPHABET, ROOM_CODE_PATTERN, isRoomCode, joinUrl, newRoomCode } from '@/net';

/** A byte source that hands out `bytes` in order across calls. */
function scripted(bytes: number[]): (n: number) => Uint8Array {
  let i = 0;
  return (n) => {
    const out = new Uint8Array(n);
    for (let k = 0; k < n; k++) out[k] = bytes[i++ % bytes.length];
    return out;
  };
}

describe('room code alphabet', () => {
  it('has 31 unique symbols with no look-alikes', () => {
    expect(ALPHABET).toHaveLength(31);
    expect(new Set(ALPHABET).size).toBe(31);
    for (const bad of ['0', 'O', '1', 'I', 'L']) expect(ALPHABET).not.toContain(bad);
    expect(ALPHABET).toMatch(/^[A-Z2-9]+$/);
  });

  it('pattern accepts exactly 4 alphabet symbols', () => {
    expect(ROOM_CODE_PATTERN.test('K7QX')).toBe(true);
    for (const bad of ['K7Q', 'K7QXX', 'k7qx', 'K0QX', 'KOQX', 'K1QX', 'KIQX', 'KLQX', 'K7Q ', '', 'K7/X']) {
      expect(ROOM_CODE_PATTERN.test(bad)).toBe(false);
      expect(isRoomCode(bad)).toBe(false);
    }
    expect(isRoomCode(1234)).toBe(false);
  });
});

describe('newRoomCode', () => {
  it('maps bytes to ALPHABET[b % 31]', () => {
    expect(newRoomCode(4, scripted([0, 1, 30, 31]))).toBe('AB9A');
    expect(newRoomCode(4, scripted([247, 62, 93, 5]))).toBe(`${ALPHABET[247 % 31]}AA${ALPHABET[5]}`);
  });

  it('rejects bytes 248..255 instead of folding them (no modulo bias)', () => {
    // 248..255 would map to the first 8 symbols under plain modulo.
    expect(newRoomCode(4, scripted([248, 255, 250, 2, 249, 3, 4, 5]))).toBe(
      ALPHABET[2] + ALPHABET[3] + ALPHABET[4] + ALPHABET[5],
    );
  });

  it('gives every symbol the same number of accepted byte values', () => {
    const all = Array.from({ length: 256 }, (_, b) => b);
    const counts = new Map<string, number>();
    const source = scripted(all);
    // 62 codes × 4 symbols = 248 accepted bytes: exactly one pass over 0..255.
    for (let i = 0; i < 62; i++) {
      for (const ch of newRoomCode(4, source)) counts.set(ch, (counts.get(ch) ?? 0) + 1);
    }
    expect(counts.size).toBe(31);
    for (const n of counts.values()) expect(n).toBe(8);
  });

  it('defaults to 4 CSPRNG symbols that match the pattern', () => {
    for (let i = 0; i < 200; i++) expect(newRoomCode()).toMatch(ROOM_CODE_PATTERN);
  });

  it('fails clearly on a broken random source or bad length', () => {
    expect(() => newRoomCode(4, () => new Uint8Array(4).fill(255))).toThrow(/unusable bytes/);
    expect(() => newRoomCode(0)).toThrow(RangeError);
    expect(() => newRoomCode(4, (() => [1, 2, 3, 4]) as unknown as (n: number) => Uint8Array)).toThrow(TypeError);
  });
});

describe('joinUrl', () => {
  it('builds /join?code=XXXX on the given origin', () => {
    expect(joinUrl('K7QX', 'https://example.web.app')).toBe('https://example.web.app/join?code=K7QX');
    expect(joinUrl('K7QX', 'http://127.0.0.1:3100/ignored/path')).toBe('http://127.0.0.1:3100/join?code=K7QX');
  });

  it('rejects invalid codes and a missing origin outside the browser', () => {
    expect(() => joinUrl('k7qx', 'https://example.web.app')).toThrow(/not a valid room code/);
    expect(() => joinUrl('K7QX&x=1', 'https://example.web.app')).toThrow();
    expect(() => joinUrl('K7QX')).toThrow(/needs an origin/);
  });
});
