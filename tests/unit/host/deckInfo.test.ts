import { describe, expect, it } from 'vitest';
import { lobby, step } from '../game/helpers';
import { reviewDeck, rulebookHint, startStatus } from '@/host/deckInfo';

describe('rulebookHint', () => {
  it('describes the rulebook mix for 10 players', () => {
    expect(rulebookHint(10)?.text).toBe('From the rulebook for 10 players: 2 Werewolves, 1 Seer, the rest Villagers.');
  });
  it('uses the singular for 1 Werewolf at 5 players', () => {
    expect(rulebookHint(5)?.werewolves).toBe('1 Werewolf');
  });
  it('returns null for an unsupported count', () => {
    expect(rulebookHint(4)).toBeNull();
    expect(rulebookHint(19)).toBeNull();
  });
});

describe('reviewDeck', () => {
  it('counts cards equal to players without the Thief', () => {
    const r = reviewDeck(8, ['witch']);
    expect(r.ok && r.total).toBe(8);
    expect(r.ok && r.summary).toBe('8 cards for 8 players');
  });
  it('adds 2 spare cards with the Thief', () => {
    const r = reviewDeck(5, ['witch', 'thief']);
    expect(r.ok && r.total).toBe(7);
    expect(r.ok && r.summary).toBe('7 cards: 5 players + 2 spare for the Thief');
  });
  it('reports too many special roles', () => {
    const r = reviewDeck(5, ['witch', 'hunter', 'cupid', 'little-girl']);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toContain('at most 3 special roles');
  });
});

describe('startStatus', () => {
  it('blocks and says how many players are missing', () => {
    const s = startStatus(lobby({ players: 3, playerCount: 5 }));
    expect(s.enabled).toBe(false);
    expect(s.label).toBe('Start — 2 more players needed');
  });
  it('names who is not ready', () => {
    const next = step(lobby({ players: 5, ready: true }), { type: 'setReady', actorId: 'p03', ready: false });
    const s = startStatus(next);
    expect(s.enabled).toBe(false);
    expect(s.label).toBe('Start — waiting for Name p03');
    expect(s.ready).toBe(4);
  });
  it('asks the playing host for a name', () => {
    const s = startStatus(lobby({ players: 4, playerCount: 5, hostMode: 'playing' }));
    expect(s.enabled).toBe(false);
    expect(s.label).toBe('Start — add your name first');
  });
  it('says remove players when there are too many', () => {
    const s = startStatus(lobby({ players: 6, playerCount: 5 }));
    expect(s.label).toBe('Start — too many players: remove 1');
  });
  it('enables Start when everyone is ready', () => {
    const s = startStatus(lobby({ players: 5 }));
    expect(s).toMatchObject({ enabled: true, label: 'Start', joined: 5, ready: 5 });
  });
  it('counts a playing host with a name as ready', () => {
    const s = startStatus(lobby({ players: 4, playerCount: 5, hostMode: 'playing', hostJoins: true }));
    expect(s.enabled).toBe(true);
  });
});
