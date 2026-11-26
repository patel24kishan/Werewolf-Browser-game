import { describe, expect, it } from 'vitest';
import { applyAction, countRoles, type Action, type RoomState } from '@/game';
import { FIXED_NOW, HOST, ctx, dealtGame, deepFreeze, lobby, playerIds, step } from './helpers';

function code(state: RoomState, action: Action): string | null {
  const r = applyAction(state, action, ctx());
  return r.ok ? null : r.error.code;
}

const host = <T extends Action['type']>(type: T) => ({ type, actorId: HOST }) as Extract<Action, { type: T }>;

describe('deal', () => {
  it('writes one card per counted player and sets status dealt', () => {
    const s = dealtGame({ players: 8 });
    expect(s.meta.status).toBe('dealt');
    expect(Object.keys(s.cards).sort()).toEqual(playerIds(8));
    expect(s.spares).toEqual([]);
    expect(countRoles(Object.values(s.cards).map((c) => c.role))).toEqual({
      werewolf: 2,
      seer: 1,
      villager: 5,
    });
  });

  it('stores the two thief spares and never deals the sheriff', () => {
    const s = dealtGame({ players: 9, specialRoles: ['thief', 'witch'] });
    expect(Object.keys(s.cards)).toHaveLength(9);
    expect(s.spares).toHaveLength(2);
    const all = [...Object.values(s.cards).map((c) => c.role), ...s.spares];
    expect(all).not.toContain('sheriff');
    expect(countRoles(all)).toEqual({ werewolf: 2, seer: 1, witch: 1, thief: 1, villager: 6 });
  });

  it('is deterministic for the same seed', () => {
    expect(dealtGame({ players: 10 }, 3).cards).toEqual(dealtGame({ players: 10 }, 3).cards);
  });

  it('gives a playing host a card and a moderating host none', () => {
    const playing = dealtGame({ players: 7, playerCount: 8, hostMode: 'playing', hostJoins: true });
    expect(playing.cards[HOST]).toBeDefined();
    const moderating = dealtGame({ players: 8, hostJoins: true });
    expect(Object.prototype.hasOwnProperty.call(moderating.cards, HOST)).toBe(false);
  });
});

describe('sheriff', () => {
  it('assigns a living player and allows reassignment for succession', () => {
    let s = dealtGame({ players: 8 });
    s = step(s, { type: 'assignSheriff', actorId: HOST, playerId: 'p01' });
    expect(s.sheriff).toBe('p01');
    s = step(s, { type: 'assignSheriff', actorId: HOST, playerId: 'p02' });
    expect(s.sheriff).toBe('p02');
  });

  it('skipSheriff clears the title', () => {
    let s = dealtGame({ players: 8 });
    s = step(s, { type: 'assignSheriff', actorId: HOST, playerId: 'p01' });
    s = step(s, host('skipSheriff'));
    expect(s.sheriff).toBeNull();
  });

  it('is rejected when the Sheriff is switched off', () => {
    const s = dealtGame({ players: 8, sheriffOn: false });
    expect(code(s, { type: 'assignSheriff', actorId: HOST, playerId: 'p01' })).toBe('sheriff-off');
    expect(code(s, host('skipSheriff'))).toBe('sheriff-off');
  });

  it('rejects a dead player, a moderating host and an unknown id', () => {
    let s = dealtGame({ players: 8, hostJoins: true });
    s = step(s, host('startNight'));
    s = step(s, { type: 'toggleKilled', actorId: HOST, playerId: 'p01' });
    s = step(s, host('confirmKills'));
    s = step(s, host('reveal'));
    expect(code(s, { type: 'assignSheriff', actorId: HOST, playerId: 'p01' })).toBe('player-dead');
    expect(code(s, { type: 'assignSheriff', actorId: HOST, playerId: HOST })).toBe('not-in-game');
    expect(code(s, { type: 'assignSheriff', actorId: HOST, playerId: 'zzz' })).toBe('not-in-game');
  });

  it('is rejected in the lobby', () => {
    expect(code(lobby({ players: 8 }), { type: 'assignSheriff', actorId: HOST, playerId: 'p01' })).toBe(
      'wrong-status',
    );
  });
});

describe('night: kill, confirm, undo, reveal', () => {
  it('runs kill → confirm → undo → confirm → reveal', () => {
    let s = dealtGame({ players: 8 });
    s = step(s, host('startNight'));
    expect(s.meta.status).toBe('night');
    expect(s.night).toEqual({ killed: {}, locked: false });

    s = step(s, { type: 'toggleKilled', actorId: HOST, playerId: 'p01' });
    s = step(s, { type: 'toggleKilled', actorId: HOST, playerId: 'p02' });
    s = step(s, { type: 'toggleKilled', actorId: HOST, playerId: 'p02' }); // un-toggle
    s = step(s, { type: 'toggleKilled', actorId: HOST, playerId: 'p03' });
    expect(s.night.killed).toEqual({ p01: true, p03: true });

    s = step(s, host('confirmKills'));
    expect(s.night.locked).toBe(true);
    expect(code(s, { type: 'toggleKilled', actorId: HOST, playerId: 'p04' })).toBe('night-locked');
    expect(code(s, host('confirmKills'))).toBe('night-locked');

    s = step(s, host('undoConfirm'));
    expect(s.night.locked).toBe(false);
    expect(code(s, host('undoConfirm'))).toBe('night-not-locked');
    expect(code(s, host('reveal'))).toBe('night-not-locked');
    s = step(s, { type: 'toggleKilled', actorId: HOST, playerId: 'p03' });
    s = step(s, host('confirmKills'));

    // Nothing has reached the players before the reveal.
    expect(s.players.p01.alive).toBe(true);
    expect(s.events).toEqual({});

    s = step(s, host('reveal'), ctx(1, FIXED_NOW));
    expect(s.meta.status).toBe('day');
    expect(s.players.p01.alive).toBe(false);
    expect(s.players.p03.alive).toBe(true);
    expect(s.events).toEqual({ p01: { killedAt: FIXED_NOW } });
  });

  it('allows a night with no kills', () => {
    let s = step(dealtGame({ players: 8 }), host('startNight'));
    s = step(s, host('confirmKills'));
    s = step(s, host('reveal'));
    expect(s.meta.status).toBe('day');
    expect(s.events).toEqual({});
  });

  it('keeps dead players dead and not toggleable on later nights', () => {
    let s = step(dealtGame({ players: 8 }), host('startNight'));
    s = step(s, { type: 'toggleKilled', actorId: HOST, playerId: 'p01' });
    s = step(s, host('confirmKills'));
    s = step(s, host('reveal'), ctx(1, 1000));

    s = step(s, host('startNight'));
    expect(s.night.killed).toEqual({});
    expect(code(s, { type: 'toggleKilled', actorId: HOST, playerId: 'p01' })).toBe('player-dead');
    s = step(s, { type: 'toggleKilled', actorId: HOST, playerId: 'p02' });
    s = step(s, host('confirmKills'));
    s = step(s, host('reveal'), ctx(1, 2000));

    expect(s.players.p01.alive).toBe(false);
    expect(s.players.p02.alive).toBe(false);
    expect(s.events).toEqual({ p01: { killedAt: 1000 }, p02: { killedAt: 2000 } });
  });

  it('rejects toggling a moderating host or an unknown id', () => {
    const s = step(dealtGame({ players: 8, hostJoins: true }), host('startNight'));
    expect(code(s, { type: 'toggleKilled', actorId: HOST, playerId: HOST })).toBe('not-in-game');
    expect(code(s, { type: 'toggleKilled', actorId: HOST, playerId: 'nobody' })).toBe('not-in-game');
  });

  it('rejects night actions outside the night', () => {
    const s = dealtGame({ players: 8 });
    expect(code(s, { type: 'toggleKilled', actorId: HOST, playerId: 'p01' })).toBe('wrong-status');
    expect(code(s, host('confirmKills'))).toBe('wrong-status');
    expect(code(s, host('reveal'))).toBe('wrong-status');
    expect(code(lobby({ players: 8 }), host('startNight'))).toBe('wrong-status');
  });

  it('rejects a reveal when the clock returns garbage', () => {
    let s = step(dealtGame({ players: 8 }), host('startNight'));
    s = step(s, host('confirmKills'));
    const r = applyAction(s, host('reveal'), { rng: () => 0, now: () => Number.NaN });
    expect(!r.ok && r.error.code).toBe('invalid-context');
  });
});

describe('end of game and host handover', () => {
  function finishedGame(): RoomState {
    let s = dealtGame({ players: 8, specialRoles: ['thief'] });
    s = step(s, { type: 'assignSheriff', actorId: HOST, playerId: 'p02' });
    s = step(s, host('startNight'));
    s = step(s, { type: 'toggleKilled', actorId: HOST, playerId: 'p01' });
    s = step(s, host('confirmKills'));
    s = step(s, host('reveal'));
    return step(s, host('endGame'));
  }

  it('endGame moves to over', () => {
    expect(finishedGame().meta.status).toBe('over');
    expect(code(lobby({ players: 8 }), host('endGame'))).toBe('wrong-status');
  });

  it('chooseNextHost hands over and clears the game but keeps the lobby', () => {
    const over = finishedGame();
    const s = step(over, { type: 'chooseNextHost', actorId: HOST, newHostId: 'p05' });
    expect(s.meta).toEqual({ ...over.meta, hostId: 'p05', status: 'lobby' });
    expect(s.deck).toEqual(over.deck);
    expect(Object.keys(s.players).sort()).toEqual(playerIds(8));
    for (const p of Object.values(s.players)) {
      expect(p.ready).toBe(false);
      expect(p.alive).toBe(true);
    }
    expect(s.players.p03.name).toBe(over.players.p03.name);
    expect(s.cards).toEqual({});
    expect(s.spares).toEqual([]);
    expect(s.night).toEqual({ killed: {}, locked: false });
    expect(s.events).toEqual({});
    expect(s.sheriff).toBeNull();
  });

  it('the old host becomes a regular player and the new host holds authority', () => {
    let s = dealtGame({ players: 7, playerCount: 8, hostMode: 'playing', hostJoins: true });
    s = step(s, host('endGame'));
    s = step(s, { type: 'chooseNextHost', actorId: HOST, newHostId: 'p01' });
    expect(code(s, { type: 'setHostMode', actorId: HOST, hostMode: 'moderating' })).toBe('not-host');
    s = step(s, { type: 'setReady', actorId: HOST, ready: true });
    expect(s.players[HOST].ready).toBe(true);
    s = step(s, { type: 'setHostMode', actorId: 'p01', hostMode: 'playing' });
    expect(s.meta.hostMode).toBe('playing');
  });

  it('keeping the same host is allowed', () => {
    const s = step(finishedGame(), { type: 'chooseNextHost', actorId: HOST, newHostId: HOST });
    expect(s.meta.hostId).toBe(HOST);
    expect(s.meta.status).toBe('lobby');
  });

  it('rejects an unknown next host and use outside over', () => {
    expect(code(finishedGame(), { type: 'chooseNextHost', actorId: HOST, newHostId: 'nobody' })).toBe(
      'unknown-player',
    );
    expect(code(dealtGame({ players: 8 }), { type: 'chooseNextHost', actorId: HOST, newHostId: HOST })).toBe(
      'wrong-status',
    );
  });

  it('the next game can be dealt again after everyone readies', () => {
    let s = step(finishedGame(), { type: 'chooseNextHost', actorId: HOST, newHostId: HOST });
    for (const id of playerIds(8)) s = step(s, { type: 'setReady', actorId: id, ready: true });
    s = step(s, host('deal'), ctx(11));
    expect(s.meta.status).toBe('dealt');
    expect(Object.keys(s.cards)).toHaveLength(8);
  });
});

describe('immutability', () => {
  it('never mutates the state or the action across a whole game', () => {
    const c = () => ctx(5, FIXED_NOW);
    const actions: Action[] = [
      { type: 'join', actorId: 'p01', name: 'Again' }, // rejected: already joined
      { type: 'setReady', actorId: 'p01', ready: false },
      { type: 'setReady', actorId: 'p01', ready: true },
      host('deal'),
      { type: 'assignSheriff', actorId: HOST, playerId: 'p02' },
      host('startNight'),
      { type: 'toggleKilled', actorId: HOST, playerId: 'p01' },
      host('confirmKills'),
      host('undoConfirm'),
      host('confirmKills'),
      host('reveal'),
      { type: 'setConnected', actorId: 'p03', connected: false },
      host('endGame'),
      { type: 'chooseNextHost', actorId: HOST, newHostId: 'p04' },
    ];
    let s = deepFreeze(lobby({ players: 8 }));
    for (const a of actions) {
      const frozenAction = deepFreeze({ ...a });
      const before = JSON.stringify(s);
      const r = applyAction(s, frozenAction, c());
      expect(JSON.stringify(s)).toBe(before);
      if (r.ok) s = deepFreeze(r.state);
    }
    expect(s.meta.hostId).toBe('p04');
  });
});
