import { describe, expect, it } from 'vitest';
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  SPECIAL_ROLE_IDS,
  buildDeck,
  countRoles,
  deal,
  getCardMix,
  shuffle,
  type DealtRoleId,
  type SpecialRoleId,
} from '@/game';
import { deepFreeze, playerIds, seededRng } from './helpers';

function deckOf(count: number, specials: SpecialRoleId[] = []): DealtRoleId[] {
  const r = buildDeck(count, specials);
  if (!r.ok) throw new Error(r.error.code);
  return r.deck;
}

describe('buildDeck', () => {
  it('builds the base mix for every player count', () => {
    for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
      const mix = getCardMix(n)!;
      const deck = deckOf(n);
      expect(deck).toHaveLength(n);
      expect(countRoles(deck)).toEqual({
        werewolf: mix.werewolves,
        seer: mix.seer,
        villager: mix.villagers,
      });
    }
  });

  it('replaces one villager per special role and keeps the werewolf count', () => {
    const deck = deckOf(10, ['witch', 'hunter', 'cupid', 'little-girl']);
    expect(deck).toHaveLength(10);
    expect(countRoles(deck)).toEqual({
      werewolf: 2,
      seer: 1,
      witch: 1,
      hunter: 1,
      cupid: 1,
      'little-girl': 1,
      villager: 3,
    });
  });

  it('adds two extra villagers with the thief (players + 2 cards)', () => {
    const deck = deckOf(8, ['thief']);
    expect(deck).toHaveLength(10);
    expect(countRoles(deck)).toEqual({ werewolf: 2, seer: 1, thief: 1, villager: 6 });
  });

  it('never puts the sheriff in the deck', () => {
    for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
      expect(deckOf(n, ['thief'])).not.toContain('sheriff');
    }
    const r = buildDeck(8, ['sheriff' as SpecialRoleId]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('invalid-role');
  });

  it('is in canonical order whatever order the specials are given', () => {
    expect(deckOf(9, ['thief', 'witch'])).toEqual(deckOf(9, ['witch', 'thief']));
  });

  it('allows all five specials when there are enough villagers', () => {
    const deck = deckOf(8, [...SPECIAL_ROLE_IDS]);
    expect(deck).toHaveLength(10);
    expect(countRoles(deck).villager).toBe(2);
  });

  it.each([
    [4, 'invalid-player-count'],
    [19, 'invalid-player-count'],
    [8.5, 'invalid-player-count'],
    [Number.NaN, 'invalid-player-count'],
  ])('rejects player count %s with %s', (count, code) => {
    const r = buildDeck(count, []);
    expect(r).toEqual({ ok: false, error: { code, message: expect.any(String) } });
  });

  it('rejects unknown, base and duplicate roles', () => {
    const cases: [unknown, string][] = [
      [['dragon'], 'invalid-role'],
      [['villager'], 'invalid-role'],
      [['werewolf'], 'invalid-role'],
      [['seer'], 'invalid-role'],
      [['__proto__'], 'invalid-role'],
      ['witch', 'invalid-role'],
      [['witch', 'witch'], 'duplicate-role'],
    ];
    for (const [roles, code] of cases) {
      const r = buildDeck(8, roles as SpecialRoleId[]);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe(code);
    }
  });

  it('rejects more specials than base villagers', () => {
    // 5 players have 3 base villagers.
    const r = buildDeck(5, ['witch', 'hunter', 'cupid', 'little-girl']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('too-many-specials');
    expect(buildDeck(5, ['witch', 'hunter', 'cupid']).ok).toBe(true);
  });
});

describe('shuffle', () => {
  it('is deterministic for the same seed and keeps every card', () => {
    const deck = deckOf(12, ['witch', 'hunter']);
    const a = shuffle(deck, seededRng(1));
    const b = shuffle(deck, seededRng(1));
    expect(a).toEqual(b);
    expect([...a].sort()).toEqual([...deck].sort());
  });

  it('gives different orders for different seeds', () => {
    const deck = playerIds(18);
    expect(shuffle(deck, seededRng(1))).not.toEqual(shuffle(deck, seededRng(2)));
  });

  it('does not mutate its input', () => {
    const deck = deepFreeze(deckOf(8));
    const copy = [...deck];
    shuffle(deck, seededRng(3));
    expect(deck).toEqual(copy);
  });

  it('clamps rng values outside [0, 1)', () => {
    const deck = [1, 2, 3, 4];
    expect([...shuffle(deck, () => 1)].sort()).toEqual(deck);
    expect([...shuffle(deck, () => -5)].sort()).toEqual(deck);
    expect([...shuffle(deck, () => Number.NaN)].sort()).toEqual(deck);
  });
});

describe('deal', () => {
  it('gives every player exactly one card and no spares without the thief', () => {
    const ids = playerIds(8);
    const deck = deckOf(8);
    const r = deal(ids, deck, seededRng(5));
    if (!r.ok) throw new Error(r.error.code);
    expect(Object.keys(r.cards).sort()).toEqual(ids);
    expect(r.spares).toEqual([]);
    expect(Object.values(r.cards).sort()).toEqual([...deck].sort());
  });

  it('returns two spares with the thief', () => {
    const ids = playerIds(8);
    const deck = deckOf(8, ['thief']);
    const r = deal(ids, deck, seededRng(5));
    if (!r.ok) throw new Error(r.error.code);
    expect(Object.keys(r.cards)).toHaveLength(8);
    expect(r.spares).toHaveLength(2);
    expect([...Object.values(r.cards), ...r.spares].sort()).toEqual([...deck].sort());
  });

  it('is deterministic for a seeded rng', () => {
    const ids = playerIds(10);
    const deck = deckOf(10, ['witch', 'thief']);
    expect(deal(ids, deck, seededRng(99))).toEqual(deal(ids, deck, seededRng(99)));
  });

  it('does not mutate its inputs', () => {
    const ids = deepFreeze(playerIds(8));
    const deck = deepFreeze(deckOf(8, ['thief']));
    const before = JSON.stringify([ids, deck]);
    expect(deal(ids, deck, seededRng(1)).ok).toBe(true);
    expect(JSON.stringify([ids, deck])).toBe(before);
  });

  it('rejects a deck of the wrong size', () => {
    const r = deal(playerIds(7), deckOf(8), seededRng(1));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('deck-size-mismatch');
    const r2 = deal(playerIds(10), deckOf(8, ['thief']), seededRng(1));
    expect(r2.ok).toBe(false);
  });

  it('rejects duplicate, unsafe and prototype-key ids', () => {
    const deck = deckOf(5);
    const dup = deal(['a', 'b', 'c', 'd', 'a'], deck, seededRng(1));
    expect(!dup.ok && dup.error.code).toBe('duplicate-player');
    for (const bad of ['__proto__', 'constructor', 'prototype', 'a/b', '', 'x'.repeat(129)]) {
      const r = deal(['a', 'b', 'c', 'd', bad], deck, seededRng(1));
      expect(!r.ok && r.error.code).toBe('invalid-id');
    }
  });

  it('rejects the sheriff or unknown cards in the deck', () => {
    const r = deal(['a', 'b'], ['seer', 'sheriff' as DealtRoleId], seededRng(1));
    expect(!r.ok && r.error.code).toBe('invalid-role');
  });
});
