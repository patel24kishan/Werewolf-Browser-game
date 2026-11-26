import { describe, expect, it } from 'vitest';
import { applyAction, isSafeId, parseAction, type RoomState } from '@/game';
import { HOST, ctx, dealtGame, freshRoom, lobby, raw, step } from './helpers';

const PROTO_KEYS = ['__proto__', 'constructor', 'prototype', 'toString', 'hasOwnProperty', 'valueOf'];

function code(state: RoomState, action: unknown): string | null {
  const r = applyAction(state, raw(action), ctx());
  return r.ok ? null : r.error.code;
}

describe('safe ids', () => {
  it('accepts Firebase-style uids and rejects everything else', () => {
    expect(isSafeId('aZ09_-')).toBe(true);
    expect(isSafeId('x'.repeat(128))).toBe(true);
    for (const bad of [...PROTO_KEYS, '', 'x'.repeat(129), 'a.b', 'a/b', 'a$b', 'a b', 'a#b', 7, null]) {
      expect(isSafeId(bad)).toBe(false);
    }
  });

  it('rejects prototype-key actor ids for joining', () => {
    for (const id of PROTO_KEYS) {
      expect(code(freshRoom(), { type: 'join', actorId: id, name: 'Evil' })).toBe('invalid-id');
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('rejects prototype-key target ids', () => {
    const s = step(dealtGame({ players: 8 }), { type: 'startNight', actorId: HOST });
    for (const id of PROTO_KEYS) {
      expect(code(s, { type: 'toggleKilled', actorId: HOST, playerId: id })).toBe('invalid-id');
      expect(code(s, { type: 'assignSheriff', actorId: HOST, playerId: id })).toBe('invalid-id');
    }
  });

  it('does not treat inherited members as players in a JSON-parsed state', () => {
    // A state that arrived over the wire with a hostile own __proto__ key.
    const wire = JSON.parse(
      JSON.stringify(lobby({ players: 7, playerCount: 8 })).replace(
        '"players":{',
        '"players":{"__proto__":{"name":"x","ready":true,"connected":true,"alive":true},',
      ),
    ) as RoomState;
    expect(Object.prototype.hasOwnProperty.call(wire.players, '__proto__')).toBe(true);
    const r = applyAction(wire, { type: 'deal', actorId: HOST }, ctx());
    expect(!r.ok && r.error.code).toBe('start-rule-failed'); // only 7 real players counted
    expect(({} as Record<string, unknown>).name).toBeUndefined();
  });
});

describe('action payload validation', () => {
  it('rejects unknown action types, including inherited names', () => {
    for (const type of ['explode', 'toString', '__proto__', 'constructor', 42, undefined]) {
      expect(code(freshRoom(), { type, actorId: HOST })).toBe('unknown-action');
    }
  });

  it('rejects non-object actions', () => {
    for (const a of [null, undefined, 'deal', 3, ['deal']]) {
      expect(code(freshRoom(), a)).toBe('invalid-action');
    }
  });

  it('rejects missing, wrongly typed and extra fields', () => {
    const s = freshRoom();
    expect(code(s, { type: 'join', actorId: 'p1' })).toBe('invalid-action');
    expect(code(s, { type: 'join', actorId: 'p1', name: 5 })).toBe('invalid-action');
    expect(code(s, { type: 'join', name: 'x' })).toBe('invalid-id');
    expect(code(s, { type: 'join', actorId: 'p1', name: 'x', alive: false })).toBe('invalid-action');
    expect(code(s, { type: 'setHostMode', actorId: HOST, hostMode: 'god' })).toBe('invalid-action');
    expect(code(s, { type: 'configureDeck', actorId: HOST, playerCount: '8', specialRoles: [], sheriffOn: true })).toBe(
      'invalid-action',
    );
    expect(code(s, { type: 'deal', actorId: HOST, rigged: true })).toBe('invalid-action');
  });

  it('parseAction returns the action unchanged when valid', () => {
    const a = { type: 'setReady', actorId: 'p1', ready: true };
    expect(parseAction(a)).toEqual({ ok: true, action: a });
  });
});

describe('robustness', () => {
  it('returns an error instead of throwing for a malformed state or context', () => {
    expect(applyAction(raw(null) as never, { type: 'deal', actorId: HOST }, ctx()).ok).toBe(false);
    expect(applyAction({} as RoomState, { type: 'deal', actorId: HOST }, ctx()).ok).toBe(false);
    const s = freshRoom();
    expect(applyAction(s, { type: 'deal', actorId: HOST }, {} as never).ok).toBe(false);
    const broken = { ...s, players: { p1: null } } as unknown as RoomState;
    const r = applyAction(broken, { type: 'setReady', actorId: 'p1', ready: true }, ctx());
    expect(r.ok).toBe(false);
  });
});
