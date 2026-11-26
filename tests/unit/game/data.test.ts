import { describe, expect, it } from 'vitest';
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  ROLE_IDS,
  ROLES,
  SPECIAL_ROLE_IDS,
  getCardMix,
  isRoleId,
} from '@/game';
import cardMix from '@/game/data/card-mix.json';

// Expected rows, copied from design/rules/03-setup-and-card-mix.md
// (5–7 from the "proposed" small-lobby table, 8–18 from the rulebook table).
const EXPECTED: Record<number, [werewolves: number, seer: number, villagers: number]> = {
  5: [1, 1, 3],
  6: [1, 1, 4],
  7: [2, 1, 4],
  8: [2, 1, 5],
  9: [2, 1, 6],
  10: [2, 1, 7],
  11: [2, 1, 8],
  12: [3, 1, 8],
  13: [3, 1, 9],
  14: [3, 1, 10],
  15: [3, 1, 11],
  16: [3, 1, 12],
  17: [3, 1, 13],
  18: [4, 1, 13],
};

describe('card-mix.json', () => {
  it('covers exactly the player counts 5 to 18', () => {
    expect(MIN_PLAYERS).toBe(5);
    expect(MAX_PLAYERS).toBe(18);
    expect(Object.keys(cardMix).map(Number).sort((a, b) => a - b)).toEqual(
      Object.keys(EXPECTED).map(Number),
    );
  });

  for (const [count, [werewolves, seer, villagers]] of Object.entries(EXPECTED)) {
    it(`matches the rules table for ${count} players`, () => {
      const row = getCardMix(Number(count));
      expect(row).toEqual({ werewolves, seer, villagers });
      expect(werewolves + seer + villagers).toBe(Number(count));
    });
  }

  it('returns undefined for unsupported counts', () => {
    for (const n of [0, 4, 19, 8.5, NaN, -1]) expect(getCardMix(n)).toBeUndefined();
  });
});

describe('roles.json', () => {
  it('has exactly the nine role ids', () => {
    expect(Object.keys(ROLES).sort()).toEqual([...ROLE_IDS].sort());
  });

  it('gives every role a name, a one-line power, an art file and a team', () => {
    for (const id of ROLE_IDS) {
      const role = ROLES[id];
      expect(role.name.length).toBeGreaterThan(0);
      expect(role.power.length).toBeGreaterThan(0);
      expect(role.power).not.toContain('\n');
      expect(role.art).toBe(`${id}.svg`);
      expect(['village', 'wolves', 'none']).toContain(role.team);
    }
  });

  it('marks only the werewolf as wolves and only the sheriff as not dealt', () => {
    expect(ROLE_IDS.filter((id) => ROLES[id].team === 'wolves')).toEqual(['werewolf']);
    expect(ROLE_IDS.filter((id) => !ROLES[id].dealt)).toEqual(['sheriff']);
  });

  it('lists the five special roles', () => {
    expect(SPECIAL_ROLE_IDS).toEqual(['witch', 'hunter', 'cupid', 'little-girl', 'thief']);
  });

  it('recognises role ids and rejects inherited names', () => {
    expect(isRoleId('seer')).toBe(true);
    expect(isRoleId('toString')).toBe(false);
    expect(isRoleId('__proto__')).toBe(false);
  });
});
