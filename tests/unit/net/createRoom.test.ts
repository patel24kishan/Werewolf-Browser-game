import { afterEach, describe, expect, it } from 'vitest';
import { CREATE_ROOM_ATTEMPTS, RoomCodeUnavailableError, createRoom, type RoomBackend } from '@/net';
import { TabPool } from '../../helpers/net';

const NOW = 1_700_000_000_000;

/** A backend whose claimRoom answers from a script; records claims and updates. */
function scriptedBackend(answers: boolean[]) {
  const claims: Array<{ code: string; meta: Record<string, unknown> }> = [];
  const updates: Array<Record<string, unknown>> = [];
  const backend: RoomBackend = {
    signIn: async () => 'host',
    claimRoom: async (code, meta) => {
      claims.push({ code, meta: { ...meta } });
      return answers[claims.length - 1] ?? false;
    },
    read: async () => null,
    subscribe: () => () => undefined,
    update: async (writes) => void updates.push({ ...writes }),
    remove: async () => undefined,
    onDisconnect: async () => ({ cancel: async () => undefined }),
  };
  return { backend, claims, updates };
}

function codes(...list: string[]): () => string {
  let i = 0;
  return () => list[i++];
}

let pool = new TabPool();
afterEach(async () => {
  await pool.closeAll();
  pool = new TabPool();
});

describe('createRoom', () => {
  it('claims a code with the initial meta, then writes the deck', async () => {
    const { backend, claims, updates } = scriptedBackend([true]);
    const code = await createRoom(backend, 'host', { now: () => NOW, newCode: codes('K7QX') });
    expect(code).toBe('K7QX');
    expect(claims).toEqual([
      { code: 'K7QX', meta: { hostId: 'host', hostMode: 'moderating', status: 'lobby', sheriffOn: true, createdAt: NOW } },
    ]);
    expect(updates).toEqual([{ 'rooms/K7QX/deck': { playerCount: 8, specialRoles: [] } }]);
  });

  it('retries a taken code with a new one', async () => {
    const { backend, claims } = scriptedBackend([false, false, true]);
    const code = await createRoom(backend, 'host', { now: () => NOW, newCode: codes('AAAA', 'BBBB', 'CCCC') });
    expect(code).toBe('CCCC');
    expect(claims.map((c) => c.code)).toEqual(['AAAA', 'BBBB', 'CCCC']);
  });

  it('gives up with a clear error after 5 taken codes', async () => {
    const { backend, claims, updates } = scriptedBackend([false, false, false, false, false, true]);
    const attempt = createRoom(backend, 'host', { newCode: codes('AAAA', 'BBBB', 'CCCC', 'DDDD', 'EEEE', 'FFFF') });
    await expect(attempt).rejects.toBeInstanceOf(RoomCodeUnavailableError);
    await expect(attempt).rejects.toThrow('Could not find a free game code. Try again.');
    expect(CREATE_ROOM_ATTEMPTS).toBe(5);
    expect(claims).toHaveLength(5);
    expect(updates).toHaveLength(0);
  });

  it('rejects an unsafe host id or an invalid generated code', async () => {
    const { backend } = scriptedBackend([true]);
    await expect(createRoom(backend, '__proto__')).rejects.toThrow(/safe id/);
    await expect(createRoom(backend, 'host', { newCode: () => 'K7/X' })).rejects.toThrow(/invalid/);
  });

  it('skips a code already taken in the memory backend', async () => {
    const db = pool.open('a');
    await db.claimRoom('AAAA', { hostId: 'someone', status: 'lobby' });
    const code = await createRoom(db, 'host', { now: () => NOW, newCode: codes('AAAA', 'BBBB') });
    expect(code).toBe('BBBB');
    expect(await db.read('rooms/AAAA/meta/hostId')).toBe('someone');
    expect(await db.read('rooms/BBBB')).toEqual({
      meta: { hostId: 'host', hostMode: 'moderating', status: 'lobby', sheriffOn: true, createdAt: NOW },
      deck: { playerCount: 8 }, // empty specialRoles is not stored
    });
  });

  it('uses random codes by default', async () => {
    const db = pool.open('a');
    expect(await createRoom(db, 'host')).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/);
  });
});
