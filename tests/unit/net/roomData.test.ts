import { describe, expect, it } from 'vitest';
import { applyAction, newRoomState, type Action, type RoomState } from '@/game';
import { buildRoomState, diffRoomState } from '@/net';
import { parseDeck, parsePlayers, parseSpares } from '@/net/roomData';

const CODE = 'K7QX';
const HOST = 'host';
const ctx = { rng: () => 0.42, now: () => 1234 };

function must(state: RoomState, action: Action): RoomState {
  const r = applyAction(state, action, ctx);
  if (!r.ok) throw new Error(r.error.message);
  return r.state;
}

function lobby(n: number): RoomState {
  const created = newRoomState(HOST, 1);
  if (!created.ok) throw new Error('setup');
  let s = must(created.state, { type: 'configureDeck', actorId: HOST, playerCount: n, specialRoles: ['thief'], sheriffOn: true });
  for (let i = 1; i <= n; i++) {
    s = must(s, { type: 'join', actorId: `p${i}`, name: `P${i}` });
    s = must(s, { type: 'setReady', actorId: `p${i}`, ready: true });
  }
  return s;
}

describe('buildRoomState (untrusted data)', () => {
  it('returns null without a usable meta, and never throws', () => {
    expect(buildRoomState({})).toBeNull();
    expect(buildRoomState({ meta: { hostId: '__proto__', status: 'lobby' } })).toBeNull();
    expect(buildRoomState({ meta: { hostId: 'h', status: 'party' } })).toBeNull();
    const hostile = { get hostId() { throw new Error('boom'); } };
    expect(buildRoomState({ meta: hostile })).toBeNull();
    for (const junk of [null, 7, 'x', [], [1, 2], true]) {
      expect(() => buildRoomState({ meta: junk, deck: junk, players: junk, cards: junk, spares: junk, sheriff: junk, night: junk, events: junk })).not.toThrow();
    }
  });

  it('keeps only safe ids and known fields, with defaults for the rest', () => {
    const players = JSON.parse(
      '{"p1":{"name":" Asha ","ready":"yes","extra":1},"__proto__":{"name":"Evil"},"bad id":{"name":"X"},"p2":{"ready":true},"p3":{"name":""}}',
    );
    const state = buildRoomState({
      meta: { hostId: 'h', status: 'night', hostMode: 'weird', sheriffOn: 'no' },
      deck: { playerCount: 99, specialRoles: ['witch', 'witch', 'sheriff', 'nope', 'hunter'] },
      players,
      cards: { p1: { role: 'seer' }, p2: { role: 'sheriff' }, p3: 'seer' },
      spares: { 0: 'villager', 1: 'king', 2: 'villager' },
      sheriff: 'a/b',
      night: { killed: { p1: true, p2: 'true', constructor: true }, locked: 1 },
      events: { p1: { killedAt: 5 }, p2: { killedAt: 'soon' } },
    });
    expect(state).toEqual({
      meta: { hostId: 'h', hostMode: 'moderating', status: 'night', sheriffOn: true, createdAt: 0 },
      deck: { playerCount: 8, specialRoles: ['witch', 'hunter'] },
      players: { p1: { name: 'Asha', ready: false, connected: false, alive: true } },
      cards: { p1: { role: 'seer' } },
      spares: ['villager', 'villager'],
      sheriff: null,
      night: { killed: { p1: true }, locked: false },
      events: { p1: { killedAt: 5 } },
    });
    expect(Object.keys(state!.players)).toEqual(['p1']);
    expect(({} as Record<string, unknown>).name).toBeUndefined();
  });

  it('parses Firebase-style array objects', () => {
    expect(parseDeck({ playerCount: 9, specialRoles: { 1: 'hunter', 0: 'witch' } })).toEqual({ playerCount: 9, specialRoles: ['witch', 'hunter'] });
    expect(parseSpares(['villager', 'thief'])).toEqual(['villager', 'thief']);
    expect(parsePlayers(null)).toEqual({});
  });
});

describe('diffRoomState', () => {
  it('turns a deal into one update: cards, spares and status', () => {
    const before = lobby(5);
    const after = must(before, { type: 'deal', actorId: HOST });
    const writes = diffRoomState(CODE, before, after);
    const keys = Object.keys(writes).sort();
    expect(keys).toEqual([
      'rooms/K7QX/cards/p1', 'rooms/K7QX/cards/p2', 'rooms/K7QX/cards/p3', 'rooms/K7QX/cards/p4', 'rooms/K7QX/cards/p5',
      'rooms/K7QX/meta/status', 'rooms/K7QX/spares',
    ]);
    expect(writes['rooms/K7QX/meta/status']).toBe('dealt');
    expect(writes['rooms/K7QX/spares']).toHaveLength(2);
    expect(writes['rooms/K7QX/cards/p1']).toEqual({ role: after.cards.p1.role });
  });

  it('turns a reveal into one update: alive, events and status', () => {
    let s = must(lobby(5), { type: 'deal', actorId: HOST });
    s = must(s, { type: 'startNight', actorId: HOST });
    s = must(s, { type: 'toggleKilled', actorId: HOST, playerId: 'p2' });
    s = must(s, { type: 'confirmKills', actorId: HOST });
    const after = must(s, { type: 'reveal', actorId: HOST });
    expect(diffRoomState(CODE, s, after)).toEqual({
      'rooms/K7QX/meta/status': 'day',
      'rooms/K7QX/players/p2/alive': false,
      'rooms/K7QX/events/p2': { killedAt: 1234 },
    });
  });

  it('writes only the changed field of a player, and nulls for removals', () => {
    const before = lobby(5);
    expect(diffRoomState(CODE, before, must(before, { type: 'setReady', actorId: 'p3', ready: false }))).toEqual({
      'rooms/K7QX/players/p3/ready': false,
    });
    expect(diffRoomState(CODE, before, must(before, { type: 'removePlayer', actorId: HOST, playerId: 'p3' }))).toEqual({
      'rooms/K7QX/players/p3': null,
    });
    const created = newRoomState(HOST, 1);
    if (!created.ok) throw new Error('setup');
    expect(diffRoomState(CODE, created.state, must(created.state, { type: 'join', actorId: 'p9', name: 'Nia' }))).toEqual({
      'rooms/K7QX/players/p9': { name: 'Nia', ready: false, connected: true, alive: true },
    });
  });

  it('clears the night per entry when a new night starts', () => {
    let s = must(lobby(5), { type: 'deal', actorId: HOST });
    s = must(s, { type: 'startNight', actorId: HOST });
    s = must(s, { type: 'toggleKilled', actorId: HOST, playerId: 'p2' });
    s = must(s, { type: 'confirmKills', actorId: HOST });
    s = must(s, { type: 'reveal', actorId: HOST });
    expect(diffRoomState(CODE, s, must(s, { type: 'startNight', actorId: HOST }))).toEqual({
      'rooms/K7QX/meta/status': 'night',
      'rooms/K7QX/night/locked': false,
      'rooms/K7QX/night/killed/p2': null,
    });
  });

  it('is empty when nothing changed', () => {
    const s = lobby(5);
    expect(diffRoomState(CODE, s, s)).toEqual({});
  });
});
