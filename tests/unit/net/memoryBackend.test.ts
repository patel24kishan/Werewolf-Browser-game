import { afterEach, describe, expect, it } from 'vitest';
import { BackendError, MemoryBackend, GUEST_ID_STORAGE_KEY } from '@/net';
import { TabPool, idGen, settle, uniqueChannel, waitFor } from '../../helpers/net';

const META = { hostId: 'host', hostMode: 'moderating', status: 'lobby', sheriffOn: true, createdAt: 1 };

let pool = new TabPool();
afterEach(async () => {
  await pool.closeAll();
  pool = new TabPool();
});

async function errorCode(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    return error instanceof BackendError ? error.code : 'other';
  }
}

/** Records every value a subscription delivers. */
function listen(tab: MemoryBackend, path: string): unknown[] {
  const seen: unknown[] = [];
  tab.subscribe(path, (v) => seen.push(v));
  return seen;
}

describe('MemoryBackend, single tab', () => {
  it('writes, reads and deletes with null', async () => {
    const db = pool.open('a');
    await db.update({ 'rooms/K7QX/players/p1': { name: 'Asha', ready: false }, 'rooms/K7QX/sheriff': 'p1' });
    expect(await db.read('rooms/K7QX/players/p1')).toEqual({ name: 'Asha', ready: false });
    await db.update({ 'rooms/K7QX/sheriff': null, 'rooms/K7QX/players/p1/ready': true });
    expect(await db.read('rooms/K7QX')).toEqual({ players: { p1: { name: 'Asha', ready: true } } });
    await db.remove('rooms/K7QX/players/p1');
    expect(await db.read('rooms/K7QX')).toBeNull(); // empty parents are pruned
    expect(await db.read('rooms/NONE')).toBeNull();
  });

  it('rejects the whole update when one path or value is invalid', async () => {
    const db = pool.open('a');
    await db.update({ 'rooms/K7QX/sheriff': 'p1' });
    const bad: Array<Record<string, unknown>> = [
      { 'rooms/K7QX/deck': { playerCount: 8 }, 'rooms/../x': 1 },
      { 'rooms/K7QX/deck': { playerCount: 8 }, 'rooms/K7QX/__proto__/x': 1 },
      { 'rooms/K7QX/deck': { playerCount: 8 }, 'rooms/K7QX/sheriff': undefined },
      { 'rooms/K7QX/deck': { playerCount: 8 }, 'rooms/K7QX/night': { killed: JSON.parse('{"__proto__":true}') } },
      { 'rooms/K7QX/deck': { playerCount: 8 }, 'rooms/K7QX/night': { at: NaN } },
      { 'rooms/K7QX/deck': { playerCount: 8 }, 'rooms/K7QX/deck/playerCount': 9 },
    ];
    for (const writes of bad) expect(await errorCode(db.update(writes))).toMatch(/^invalid-/);
    expect(await db.read('rooms/K7QX')).toEqual({ sheriff: 'p1' });
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });

  it('validates paths on every call', async () => {
    const db = pool.open('a');
    expect(await errorCode(db.read('rooms//x'))).toBe('invalid-path');
    expect(await errorCode(db.remove('..'))).toBe('invalid-path');
    expect(await errorCode(db.onDisconnect('a/constructor', 1))).toBe('invalid-path');
    expect(() => db.subscribe('rooms/K7QX/', () => undefined)).toThrow(BackendError);
    expect(await errorCode(db.claimRoom('k7qx', META))).toBe('invalid-code');
    expect(await errorCode(db.claimRoom('K7QX/x', META))).toBe('invalid-code');
  });

  it('fires subscribers initially, then for exact, descendant and ancestor writes only', async () => {
    const db = pool.open('a');
    const player = listen(db, 'rooms/K7QX/players/p1');
    const players = listen(db, 'rooms/K7QX/players');
    const ready = listen(db, 'rooms/K7QX/players/p1/ready');
    const sibling = listen(db, 'rooms/K7QX/players/p2');
    await db.whenReady();
    await settle(0);
    expect([player, players, ready, sibling].map((s) => s.length)).toEqual([1, 1, 1, 1]);
    expect(player[0]).toBeNull();

    await db.update({ 'rooms/K7QX/players/p1': { name: 'Asha', ready: false } }); // exact
    await db.update({ 'rooms/K7QX/players/p1/ready': true }); // descendant of p1 and players
    await db.update({ 'rooms/K7QX': { players: { p1: { name: 'Bo', ready: true } } } }); // ancestor
    await db.update({ 'rooms/K7QX/players/p1/ready': true }); // no change: no callbacks

    expect(player).toEqual([null, { name: 'Asha', ready: false }, { name: 'Asha', ready: true }, { name: 'Bo', ready: true }]);
    expect(ready).toEqual([null, false, true]);
    expect(players).toHaveLength(4);
    expect(sibling).toEqual([null]);
  });

  it('stops calling after unsubscribe and delivers frozen values', async () => {
    const db = pool.open('a');
    const seen: unknown[] = [];
    const off = db.subscribe('x/y', (v) => seen.push(v));
    await db.update({ 'x/y': { a: 1 } });
    expect(Object.isFrozen(seen[seen.length - 1])).toBe(true);
    off();
    off();
    await db.update({ 'x/y': { a: 2 } });
    expect(seen).toEqual([null, { a: 1 }]);
  });

  it('claimRoom creates meta only once', async () => {
    const db = pool.open('a');
    expect(await db.claimRoom('K7QX', META)).toBe(true);
    expect(await db.claimRoom('K7QX', { ...META, hostId: 'other' })).toBe(false);
    expect(await db.read('rooms/K7QX/meta/hostId')).toBe('host');
  });

  it('a subscriber that throws does not break other subscribers', async () => {
    const db = pool.open('a');
    const original = console.error;
    console.error = () => undefined;
    try {
      db.subscribe('x', () => {
        throw new Error('boom');
      });
      const seen = listen(db, 'x');
      await db.update({ x: 1 });
      expect(seen).toEqual([null, 1]);
    } finally {
      console.error = original;
    }
  });

  it('rejects calls after close', async () => {
    const db = pool.open('a');
    await db.close();
    expect(await errorCode(db.update({ x: 1 }))).toBe('closed');
    expect(await errorCode(db.read('x'))).toBe('closed');
  });
});

describe('MemoryBackend guest ids', () => {
  it('uses the injected id, else keeps one per tab in storage', async () => {
    expect(await pool.open('a', { guestId: 'fixed-guest' }).signIn()).toBe('fixed-guest');

    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    const first = await pool.open('b', { storage }).signIn();
    expect(store.get(GUEST_ID_STORAGE_KEY)).toBe(first);
    // A refreshed tab (same sessionStorage) keeps its id; another tab gets its own.
    expect(await pool.open('c', { storage }).signIn()).toBe(first);
    expect(await pool.open('d', { storage: null }).signIn()).not.toBe(first);
  });

  it('ignores an unsafe stored id and survives a throwing storage', async () => {
    const storage = { getItem: () => '__proto__', setItem: () => undefined };
    expect(await pool.open('a', { storage }).signIn()).toBe('a-2');
    const throwing = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    expect(await pool.open('b', { storage: throwing }).signIn()).toBe('b-2');
  });
});

describe('MemoryBackend across tabs', () => {
  it('delivers a write from one tab to subscribers in another', async () => {
    const a = pool.open('a');
    const b = pool.open('b');
    await Promise.all([a.whenReady(), b.whenReady()]);
    const seenInB = listen(b, 'rooms/K7QX/players');
    await settle(0);
    await a.update({ 'rooms/K7QX/players/p1': { name: 'Asha' } });
    await b.update({ 'rooms/K7QX/players/p2': { name: 'Bo' } });
    await waitFor(() => seenInB.length === 3, 2000, 'remote callbacks');
    expect(seenInB).toEqual([null, { p1: { name: 'Asha' } }, { p1: { name: 'Asha' }, p2: { name: 'Bo' } }]);
    expect(await a.read('rooms/K7QX/players/p2')).toEqual({ name: 'Bo' });
  });

  it('gives a tab that opens later the current data', async () => {
    const a = pool.open('a');
    await a.update({ 'rooms/K7QX/deck': { playerCount: 9 }, 'rooms/K7QX/sheriff': 'p1' });
    const late = pool.open('late');
    expect(await late.read('rooms/K7QX')).toEqual({ deck: { playerCount: 9 }, sheriff: 'p1' });
    const seen = listen(late, 'rooms/K7QX/sheriff');
    await waitFor(() => seen.length === 1);
    expect(seen).toEqual(['p1']);
  });

  it('lets exactly one of many concurrent claims win', async () => {
    const tabs = ['a', 'b', 'c', 'd', 'e'].map((n) => pool.open(n));
    await Promise.all(tabs.map((t) => t.whenReady()));
    const results = await Promise.all(tabs.map((t, i) => t.claimRoom('K7QX', { ...META, hostId: `host${i}` })));
    expect(results.filter(Boolean)).toHaveLength(1);
    const winner = results.indexOf(true);
    for (const t of tabs) expect(await t.read('rooms/K7QX/meta/hostId')).toBe(`host${winner}`);
  });

  it('orders concurrent writes identically in every tab', async () => {
    const tabs = ['a', 'b', 'c'].map((n) => pool.open(n));
    await Promise.all(tabs.map((t) => t.whenReady()));
    const logs = tabs.map((t) => listen(t, 'shared/value'));
    await Promise.all(
      tabs.flatMap((t, i) => Array.from({ length: 10 }, (_, k) => t.update({ 'shared/value': `${i}-${k}`, [`shared/by/t${i}`]: k }))),
    );
    await settle(40);
    const finals = await Promise.all(tabs.map((t) => t.read('shared')));
    expect(finals[1]).toEqual(finals[0]);
    expect(finals[2]).toEqual(finals[0]);
    expect(finals[0]).toMatchObject({ by: { t0: 9, t1: 9, t2: 9 } });
    // Every tab saw the same sequence of values (after its own first delivery).
    const tail = (log: unknown[]) => log.slice(log.length - 5);
    expect(tail(logs[1])).toEqual(tail(logs[0]));
    expect(tail(logs[2])).toEqual(tail(logs[0]));
  });

  it('keeps data and keeps working when the leader closes', async () => {
    const a = pool.open('a');
    await a.whenReady();
    const b = pool.open('b');
    const c = pool.open('c');
    await Promise.all([b.whenReady(), c.whenReady()]);
    expect(a.isLeader).toBe(true);
    await a.update({ 'rooms/K7QX/sheriff': 'p1' });
    await settle(10);
    await a.close();
    await waitFor(() => b.isLeader || c.isLeader, 2000, 'a new leader');
    await b.update({ 'rooms/K7QX/deck': { playerCount: 6 } });
    await c.update({ 'rooms/K7QX/players/p2': { name: 'Bo' } });
    for (const t of [b, c]) {
      expect(await t.read('rooms/K7QX')).toEqual({ sheriff: 'p1', deck: { playerCount: 6 }, players: { p2: { name: 'Bo' } } });
    }
    const late = pool.open('late');
    expect(await late.read('rooms/K7QX/sheriff')).toBe('p1');
  });

  it('runs onDisconnect writes when a tab goes away, and not after cancel', async () => {
    const a = pool.open('a');
    const b = pool.open('b');
    await Promise.all([a.whenReady(), b.whenReady()]);
    await a.update({ 'p/b/connected': true, 'p/c/connected': true });
    await b.onDisconnect('p/b/connected', false);
    const cancelled = await b.onDisconnect('p/b/extra', 'should-not-appear');
    await cancelled.cancel();
    await b.close();
    await waitFor(async () => (await a.read('p/b/connected')) === false, 2000, 'disconnect write');
    expect(await a.read('p/b')).toEqual({ connected: false });

    // The leader's own handlers run on the next leader when it leaves.
    const c = pool.open('c');
    await c.whenReady();
    await a.onDisconnect('p/c/connected', false);
    await a.close();
    await waitFor(async () => (await c.read('p/c/connected')) === false, 2000, 'leader disconnect write');
  });

  it('ignores malformed and hostile messages from the channel', async () => {
    const a = pool.open('a');
    await a.whenReady();
    await a.update({ safe: 1 });
    const rogue = new BroadcastChannel(pool.channelName);
    try {
      const hostileTree = JSON.parse('{"__proto__":{"polluted":true},"safe":2}');
      rogue.postMessage({ type: 'snapshot', from: 'rogue', to: '*', replica: { epoch: 99, seq: 99, tree: hostileTree, od: [], log: [] } });
      rogue.postMessage({ type: 'commit', from: 'rogue', commit: { epoch: 1, seq: 2, reqId: null, requester: 'x', writes: [['../x', 1]], od: null, result: true } });
      rogue.postMessage({ type: 'request', from: 'rogue', reqId: 'r1', op: { kind: 'update', writes: { '__proto__/x': 1 } } });
      rogue.postMessage('garbage');
      rogue.postMessage(null);
      rogue.postMessage({ type: 'hello', from: '__proto__' });
      await settle(40);
      expect(await a.read('safe')).toBe(1);
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
      expect(({} as Record<string, unknown>).x).toBeUndefined();
    } finally {
      rogue.close();
    }
  });
});

describe('MemoryBackend without Web Locks', () => {
  it('still syncs two tabs through the first tab as leader', async () => {
    const channelName = uniqueChannel('nolocks');
    const a = pool.open('a', { channelName, locks: null });
    await a.whenReady();
    const b = pool.open('b', { channelName, locks: null });
    await b.whenReady();
    expect(a.isLeader).toBe(true);
    expect(b.isLeader).toBe(false);
    await b.update({ x: 1 });
    expect(await a.read('x')).toBe(1);
    expect(await b.claimRoom('K7QX', META)).toBe(true);
    expect(await a.claimRoom('K7QX', META)).toBe(false);
    // onDisconnect runs on a clean close.
    await b.onDisconnect('gone', true);
    await b.close();
    await waitFor(async () => (await a.read('gone')) === true, 2000, 'flush on close');
  });

  it('works as a single-tab database without a channel', async () => {
    const db = new MemoryBackend({ createChannel: () => null, newId: idGen('solo'), storage: null });
    try {
      expect(db.isLeader).toBe(true);
      await db.update({ a: 1 });
      expect(await db.read('a')).toBe(1);
    } finally {
      await db.close();
    }
  });
});
