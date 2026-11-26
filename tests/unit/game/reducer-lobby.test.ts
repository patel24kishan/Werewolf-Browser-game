import { describe, expect, it } from 'vitest';
import { applyAction, newRoomState, type Action, type RoomState, type SpecialRoleId } from '@/game';
import { CREATED_AT, HOST, ctx, freshRoom, lobby, raw, step } from './helpers';

function code(state: RoomState, action: Action): string | null {
  const r = applyAction(state, action, ctx());
  return r.ok ? null : r.error.code;
}

describe('newRoomState', () => {
  it('starts an empty moderated lobby', () => {
    const s = freshRoom();
    expect(s.meta).toEqual({
      hostId: HOST,
      hostMode: 'moderating',
      status: 'lobby',
      sheriffOn: true,
      createdAt: CREATED_AT,
    });
    expect(s.players).toEqual({});
    expect(s.sheriff).toBeNull();
    expect(s.night).toEqual({ killed: {}, locked: false });
  });

  it('rejects an unsafe host id or a bad timestamp', () => {
    expect(newRoomState('__proto__', 1).ok).toBe(false);
    expect(newRoomState('a b', 1).ok).toBe(false);
    expect(newRoomState('h', Number.NaN).ok).toBe(false);
  });
});

describe('join and names', () => {
  it('adds a player with a trimmed name, not Ready, connected and alive', () => {
    const s = step(freshRoom(), { type: 'join', actorId: 'p1', name: '  Asha  ' });
    expect(s.players.p1).toEqual({ name: 'Asha', ready: false, connected: true, alive: true });
  });

  it('enforces 1 to 12 characters after trimming', () => {
    const s = freshRoom();
    expect(code(s, { type: 'join', actorId: 'p1', name: '   ' })).toBe('invalid-name');
    expect(code(s, { type: 'join', actorId: 'p1', name: 'x'.repeat(13) })).toBe('invalid-name');
    expect(code(s, { type: 'join', actorId: 'p1', name: 'x'.repeat(12) })).toBeNull();
    expect(code(s, { type: 'join', actorId: 'p1', name: 'A' })).toBeNull();
    expect(code(s, { type: 'join', actorId: 'p1', name: 'tab\there' })).toBe('invalid-name');
  });

  it('rejects a name already used, ignoring case', () => {
    const s = step(freshRoom(), { type: 'join', actorId: 'p1', name: 'Asha' });
    expect(code(s, { type: 'join', actorId: 'p2', name: ' asha ' })).toBe('name-taken');
    expect(code(s, { type: 'join', actorId: 'p2', name: 'ASHA' })).toBe('name-taken');
  });

  it('lets a player recase their own name but not take another', () => {
    let s = step(freshRoom(), { type: 'join', actorId: 'p1', name: 'Asha' });
    s = step(s, { type: 'join', actorId: 'p2', name: 'Ben' });
    s = step(s, { type: 'setName', actorId: 'p1', name: 'ASHA' });
    expect(s.players.p1.name).toBe('ASHA');
    expect(code(s, { type: 'setName', actorId: 'p1', name: 'ben' })).toBe('name-taken');
  });

  it('rejects joining twice', () => {
    const s = step(freshRoom(), { type: 'join', actorId: 'p1', name: 'Asha' });
    expect(code(s, { type: 'join', actorId: 'p1', name: 'Other' })).toBe('already-joined');
  });

  it('rejects joining once the room holds 19 records', () => {
    const s = lobby({ players: 18, hostJoins: true });
    expect(code(s, { type: 'join', actorId: 'late', name: 'Late' })).toBe('room-full');
  });

  it('rejects joining after the deal', () => {
    const s = step(lobby({ players: 8 }), { type: 'deal', actorId: HOST });
    expect(code(s, { type: 'join', actorId: 'late', name: 'Late' })).toBe('wrong-status');
  });
});

describe('player actions only touch the actor', () => {
  it('setName and setReady change the actor record and nothing else', () => {
    let s = step(freshRoom(), { type: 'join', actorId: 'p1', name: 'Asha' });
    s = step(s, { type: 'join', actorId: 'p2', name: 'Ben' });
    const after = step(s, { type: 'setReady', actorId: 'p1', ready: true });
    expect(after.players.p1.ready).toBe(true);
    expect(after.players.p2).toBe(s.players.p2);
  });

  it('cannot target another player: there is no target field', () => {
    let s = step(freshRoom(), { type: 'join', actorId: 'p1', name: 'Asha' });
    s = step(s, { type: 'join', actorId: 'p2', name: 'Ben' });
    expect(code(s, raw({ type: 'setName', actorId: 'p1', name: 'X', playerId: 'p2' }))).toBe(
      'invalid-action',
    );
    expect(code(s, raw({ type: 'setReady', actorId: 'p1', ready: true, playerId: 'p2' }))).toBe(
      'invalid-action',
    );
  });

  it('rejects setName/setReady from someone who has not joined', () => {
    const s = freshRoom();
    expect(code(s, { type: 'setName', actorId: 'ghost', name: 'Boo' })).toBe('unknown-player');
    expect(code(s, { type: 'setReady', actorId: 'ghost', ready: true })).toBe('unknown-player');
  });

  it('setConnected flips only the actor connected flag, in any status', () => {
    const s = step(lobby({ players: 8 }), { type: 'deal', actorId: HOST });
    const after = step(s, { type: 'setConnected', actorId: 'p02', connected: false });
    expect(after.players.p02.connected).toBe(false);
    expect(after.players.p01.connected).toBe(true);
  });
});

describe('host lobby actions', () => {
  it('removePlayer deletes the record', () => {
    const s = lobby({ players: 3, playerCount: 8 });
    const after = step(s, { type: 'removePlayer', actorId: HOST, playerId: 'p02' });
    expect(Object.keys(after.players).sort()).toEqual(['p01', 'p03']);
    expect(code(s, { type: 'removePlayer', actorId: HOST, playerId: 'nobody' })).toBe('unknown-player');
  });

  it('setHostMode switches the mode', () => {
    const s = step(freshRoom(), { type: 'setHostMode', actorId: HOST, hostMode: 'playing' });
    expect(s.meta.hostMode).toBe('playing');
  });

  it('configureDeck stores count, canonical specials and the Sheriff switch', () => {
    const s = step(freshRoom(), {
      type: 'configureDeck',
      actorId: HOST,
      playerCount: 10,
      specialRoles: ['thief', 'witch'],
      sheriffOn: false,
    });
    expect(s.deck).toEqual({ playerCount: 10, specialRoles: ['witch', 'thief'] });
    expect(s.meta.sheriffOn).toBe(false);
  });

  it('configureDeck rejects invalid decks', () => {
    const s = freshRoom();
    const base = { type: 'configureDeck' as const, actorId: HOST, sheriffOn: true };
    expect(code(s, { ...base, playerCount: 4, specialRoles: [] })).toBe('invalid-player-count');
    expect(code(s, { ...base, playerCount: 8, specialRoles: ['sheriff'] as unknown as SpecialRoleId[] })).toBe('invalid-role');
    expect(code(s, { ...base, playerCount: 8, specialRoles: ['witch', 'witch'] })).toBe('duplicate-role');
    expect(code(s, { ...base, playerCount: 5, specialRoles: ['witch', 'hunter', 'cupid', 'thief'] })).toBe(
      'too-many-specials',
    );
  });

  it('rejects every host action from a non-host actor', () => {
    const lobbyState = lobby({ players: 8 });
    const lobbyActions: Action[] = [
      { type: 'removePlayer', actorId: 'p01', playerId: 'p02' },
      { type: 'setHostMode', actorId: 'p01', hostMode: 'playing' },
      { type: 'configureDeck', actorId: 'p01', playerCount: 8, specialRoles: [], sheriffOn: true },
      { type: 'deal', actorId: 'p01' },
    ];
    for (const a of lobbyActions) expect(code(lobbyState, a)).toBe('not-host');

    const game = step(lobbyState, { type: 'deal', actorId: HOST });
    const gameActions: Action[] = [
      { type: 'assignSheriff', actorId: 'p01', playerId: 'p01' },
      { type: 'skipSheriff', actorId: 'p01' },
      { type: 'startNight', actorId: 'p01' },
      { type: 'toggleKilled', actorId: 'p01', playerId: 'p02' },
      { type: 'confirmKills', actorId: 'p01' },
      { type: 'undoConfirm', actorId: 'p01' },
      { type: 'reveal', actorId: 'p01' },
      { type: 'endGame', actorId: 'p01' },
      { type: 'chooseNextHost', actorId: 'p01', newHostId: 'p01' },
    ];
    for (const a of gameActions) expect(code(game, a)).toBe('not-host');
  });

  it('rejects lobby setup actions once dealt', () => {
    const s = step(lobby({ players: 8 }), { type: 'deal', actorId: HOST });
    expect(code(s, { type: 'setHostMode', actorId: HOST, hostMode: 'playing' })).toBe('wrong-status');
    expect(code(s, { type: 'removePlayer', actorId: HOST, playerId: 'p01' })).toBe('wrong-status');
    expect(code(s, { type: 'setReady', actorId: 'p01', ready: false })).toBe('wrong-status');
    expect(code(s, { type: 'deal', actorId: HOST })).toBe('wrong-status');
  });
});
