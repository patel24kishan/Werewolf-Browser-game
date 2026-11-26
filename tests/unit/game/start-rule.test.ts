import { describe, expect, it } from 'vitest';
import { applyAction, checkStartRule, countedPlayerIds } from '@/game';
import { HOST, ctx, lobby, playerIds, step } from './helpers';

describe('start rule', () => {
  it('passes with a moderating host when the count matches and all are Ready', () => {
    const s = lobby({ players: 8 });
    expect(checkStartRule(s)).toEqual({
      ok: true,
      required: 8,
      joined: 8,
      notReady: [],
      hostNeedsName: false,
    });
  });

  it('does not count a moderating host, even with a player record', () => {
    const s = lobby({ players: 8, hostJoins: true });
    expect(countedPlayerIds(s)).not.toContain(HOST);
    expect(checkStartRule(s).ok).toBe(true);
  });

  it('counts a playing host without needing their Ready tick', () => {
    const s = lobby({ players: 7, playerCount: 8, hostMode: 'playing', hostJoins: true });
    expect(countedPlayerIds(s)).toContain(HOST);
    expect(s.players[HOST].ready).toBe(false);
    expect(checkStartRule(s)).toMatchObject({ ok: true, joined: 8 });
  });

  it('fails when a playing host makes the count one too many', () => {
    const s = lobby({ players: 8, hostMode: 'playing', hostJoins: true });
    expect(checkStartRule(s)).toMatchObject({ ok: false, joined: 9, required: 8 });
  });

  it('fails when a playing host has no name yet', () => {
    const s = lobby({ players: 7, playerCount: 8, hostMode: 'playing' });
    expect(checkStartRule(s)).toMatchObject({ ok: false, joined: 8, hostNeedsName: true });
  });

  it('fails when a player is not Ready and names them', () => {
    let s = lobby({ players: 8 });
    s = step(s, { type: 'setReady', actorId: 'p03', ready: false });
    expect(checkStartRule(s)).toMatchObject({ ok: false, notReady: ['p03'] });
  });

  it('fails with too few or too many players', () => {
    expect(checkStartRule(lobby({ players: 7, playerCount: 8 }))).toMatchObject({ ok: false, joined: 7 });
    expect(checkStartRule(lobby({ players: 9, playerCount: 8 }))).toMatchObject({ ok: false, joined: 9 });
  });

  it('blocks the deal action until the rule passes', () => {
    const s = lobby({ players: 8, ready: false });
    const r = applyAction(s, { type: 'deal', actorId: HOST }, ctx());
    expect(!r.ok && r.error.code).toBe('start-rule-failed');
    let ready = s;
    for (const id of playerIds(8)) ready = step(ready, { type: 'setReady', actorId: id, ready: true });
    expect(applyAction(ready, { type: 'deal', actorId: HOST }, ctx()).ok).toBe(true);
  });
});
