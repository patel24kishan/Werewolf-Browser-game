/**
 * FirebaseBackend with the Firebase SDK mocked: no network, no real project.
 * Checks how each RoomBackend call maps onto the modular SDK.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => {
  type Listener = { path: string; next: (snap: unknown) => void; error?: (err: unknown) => void };
  const state = {
    apps: [] as Array<{ name: string }>,
    user: null as { uid: string } | null,
    authSync: false,
    authError: null as Error | null,
    listeners: [] as Listener[],
    data: {} as Record<string, unknown>,
    transaction: null as null | ((path: string, fn: (current: unknown) => unknown) => Promise<unknown>),
  };
  const snap = (value: unknown) => ({ val: () => value });
  const odSet = vi.fn(async (value: unknown) => void value);
  const odCancel = vi.fn(async () => undefined);
  const unsubscribeValue = vi.fn();
  return {
    state,
    snap,
    odSet,
    odCancel,
    unsubscribeValue,
    initializeApp: vi.fn((config: unknown, name?: string) => {
      const app = { name: name ?? '[DEFAULT]', config };
      state.apps.push(app);
      return app;
    }),
    getApps: vi.fn(() => state.apps),
    deleteApp: vi.fn(async () => undefined),
    getAuth: vi.fn((app: unknown) => ({ app, kind: 'auth' })),
    initializeAuth: vi.fn((app: unknown, deps: unknown) => ({ app, deps, kind: 'auth-memory' })),
    inMemoryPersistence: { type: 'NONE' },
    onAuthStateChanged: vi.fn(
      (_auth: unknown, next: (u: unknown) => void, error: (e: unknown) => void) => {
        const fire = () => (state.authError ? error(state.authError) : next(state.user));
        if (state.authSync) fire();
        else queueMicrotask(fire);
        return () => undefined;
      },
    ),
    signInAnonymously: vi.fn(async () => {
      state.user = { uid: 'anonUid123' };
      return { user: state.user };
    }),
    getDatabase: vi.fn((app: unknown, url: string) => ({ app, url })),
    ref: vi.fn((_db: unknown, path?: string) => ({ path: path ?? '' })),
    get: vi.fn(async (r: { path: string }) => snap(state.data[r.path] ?? null)),
    onValue: vi.fn((r: { path: string }, next: (s: unknown) => void, error?: (e: unknown) => void) => {
      state.listeners.push({ path: r.path, next, error });
      return unsubscribeValue;
    }),
    update: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
    runTransaction: vi.fn(async (r: { path: string }, fn: (current: unknown) => unknown) => {
      if (!state.transaction) throw new Error('no transaction behaviour set');
      return state.transaction(r.path, fn);
    }),
    onDisconnect: vi.fn(() => ({ set: odSet, cancel: odCancel })),
    goOffline: vi.fn(),
  };
});

vi.mock('firebase/app', () => ({
  initializeApp: sdk.initializeApp,
  getApps: sdk.getApps,
  deleteApp: sdk.deleteApp,
}));
vi.mock('firebase/auth', () => ({
  getAuth: sdk.getAuth,
  initializeAuth: sdk.initializeAuth,
  inMemoryPersistence: sdk.inMemoryPersistence,
  onAuthStateChanged: sdk.onAuthStateChanged,
  signInAnonymously: sdk.signInAnonymously,
}));
vi.mock('firebase/database', () => ({
  getDatabase: sdk.getDatabase,
  ref: sdk.ref,
  get: sdk.get,
  onValue: sdk.onValue,
  update: sdk.update,
  remove: sdk.remove,
  runTransaction: sdk.runTransaction,
  onDisconnect: sdk.onDisconnect,
  goOffline: sdk.goOffline,
}));

import { BackendError, BackendNotConfiguredError, FirebaseBackend, type FirebaseConfig } from '@/net';

const CONFIG: FirebaseConfig = {
  apiKey: 'test-api-key',
  authDomain: 'test.example',
  databaseURL: 'https://test-db.example',
  projectId: 'test-project',
  appId: 'test-app',
};
const META = { hostId: 'anonUid123', hostMode: 'moderating', status: 'lobby', sheriffOn: true, createdAt: 1 };

async function errorCode(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    return error instanceof BackendError ? error.code : 'other';
  }
}

function syncErrorCode(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (error) {
    return error instanceof BackendError ? error.code : 'other';
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  sdk.state.apps = [];
  sdk.state.user = null;
  sdk.state.authSync = false;
  sdk.state.authError = null;
  sdk.state.listeners = [];
  sdk.state.data = {};
  sdk.state.transaction = null;
});

describe('FirebaseBackend, initialization', () => {
  it('does not touch Firebase until first use, then initializes once', async () => {
    const backend = new FirebaseBackend(CONFIG);
    expect(sdk.initializeApp).not.toHaveBeenCalled();
    await backend.read('rooms/K7QX/meta');
    await backend.read('rooms/K7QX/deck');
    expect(sdk.initializeApp).toHaveBeenCalledTimes(1);
    expect(sdk.getDatabase).toHaveBeenCalledWith(expect.anything(), CONFIG.databaseURL);
    expect(sdk.getAuth).toHaveBeenCalledTimes(1);
  });

  it('reuses an existing app with the same name', async () => {
    const first = new FirebaseBackend(CONFIG);
    const second = new FirebaseBackend(CONFIG);
    await first.read('rooms/K7QX/meta');
    await second.read('rooms/K7QX/meta');
    expect(sdk.initializeApp).toHaveBeenCalledTimes(1);
  });

  it('uses in-memory auth persistence and a named app when asked', async () => {
    const backend = new FirebaseBackend(CONFIG, { appName: 'guest-a', persistence: 'memory' });
    await backend.read('rooms/K7QX/meta');
    expect(sdk.initializeApp).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'test-api-key' }), 'guest-a');
    expect(sdk.initializeAuth).toHaveBeenCalledWith(expect.anything(), { persistence: sdk.inMemoryPersistence });
    expect(sdk.getAuth).not.toHaveBeenCalled();
  });

  it('close() goes offline, deletes its own app and rejects later calls', async () => {
    const backend = new FirebaseBackend(CONFIG);
    await backend.read('rooms/K7QX/meta');
    await backend.close();
    expect(sdk.goOffline).toHaveBeenCalledTimes(1);
    expect(sdk.deleteApp).toHaveBeenCalledTimes(1);
    expect(await errorCode(backend.read('rooms/K7QX/meta'))).toBe('closed');
  });
});

describe('FirebaseBackend.signIn', () => {
  it('reuses the persisted user without signing in again', async () => {
    sdk.state.user = { uid: 'persistedUid' };
    const backend = new FirebaseBackend(CONFIG);
    expect(await backend.signIn()).toBe('persistedUid');
    expect(sdk.signInAnonymously).not.toHaveBeenCalled();
  });

  it('handles an auth callback that fires synchronously', async () => {
    sdk.state.user = { uid: 'persistedUid' };
    sdk.state.authSync = true;
    expect(await new FirebaseBackend(CONFIG).signIn()).toBe('persistedUid');
  });

  it('signs in anonymously when there is no user, once for concurrent calls', async () => {
    const backend = new FirebaseBackend(CONFIG);
    const [a, b] = await Promise.all([backend.signIn(), backend.signIn()]);
    expect(a).toBe('anonUid123');
    expect(b).toBe('anonUid123');
    expect(sdk.signInAnonymously).toHaveBeenCalledTimes(1);
    expect(await backend.signIn()).toBe('anonUid123');
    expect(sdk.onAuthStateChanged).toHaveBeenCalledTimes(1);
  });

  it('rejects with a BackendError and allows a retry after a failure', async () => {
    sdk.state.authError = new Error('network down');
    const backend = new FirebaseBackend(CONFIG);
    expect(await errorCode(backend.signIn())).toBe('rejected');
    sdk.state.authError = null;
    expect(await backend.signIn()).toBe('anonUid123');
  });

  it('rejects a uid that is not a safe id', async () => {
    sdk.state.user = { uid: 'bad/uid' };
    expect(await errorCode(new FirebaseBackend(CONFIG).signIn())).toBe('rejected');
  });
});

describe('FirebaseBackend.claimRoom', () => {
  it('creates meta when absent and resolves true', async () => {
    let written: unknown;
    sdk.state.transaction = async (path, fn) => {
      expect(path).toBe('rooms/K7QX/meta');
      written = fn(null);
      return { committed: true, snapshot: sdk.snap(written) };
    };
    expect(await new FirebaseBackend(CONFIG).claimRoom('K7QX', META)).toBe(true);
    expect(written).toEqual(META);
    expect(Object.getPrototypeOf(written)).toBe(Object.prototype); // plain JSON for the SDK
    expect(sdk.runTransaction).toHaveBeenCalledWith(expect.anything(), expect.any(Function), { applyLocally: false });
  });

  it('resolves false from the pre-check when meta already belongs to someone else', async () => {
    sdk.state.data['rooms/K7QX/meta'] = { hostId: 'someoneElse' };
    expect(await new FirebaseBackend(CONFIG).claimRoom('K7QX', META)).toBe(false);
    expect(sdk.runTransaction).not.toHaveBeenCalled();
  });

  it('treats a denied transaction as taken when meta appeared meanwhile', async () => {
    sdk.state.transaction = async () => {
      sdk.state.data['rooms/K7QX/meta'] = { hostId: 'someoneElse' };
      throw new Error('permission_denied');
    };
    expect(await new FirebaseBackend(CONFIG).claimRoom('K7QX', META)).toBe(false);
  });

  it('aborts (never overwrites) when meta exists and resolves false', async () => {
    let returned: unknown = 'not called';
    sdk.state.transaction = async (_path, fn) => {
      returned = fn({ hostId: 'someoneElse', status: 'day' });
      return { committed: false, snapshot: sdk.snap({ hostId: 'someoneElse' }) };
    };
    expect(await new FirebaseBackend(CONFIG).claimRoom('K7QX', META)).toBe(false);
    expect(returned).toBeUndefined();
  });

  it('resolves false when committed but the stored meta belongs to someone else', async () => {
    sdk.state.transaction = async () => ({ committed: true, snapshot: sdk.snap({ hostId: 'someoneElse' }) });
    expect(await new FirebaseBackend(CONFIG).claimRoom('K7QX', META)).toBe(false);
  });

  it('rejects bad codes and bad meta before calling Firebase', async () => {
    const backend = new FirebaseBackend(CONFIG);
    expect(await errorCode(backend.claimRoom('k7qx', META))).toBe('invalid-code');
    expect(await errorCode(backend.claimRoom('K7QX0', META))).toBe('invalid-code');
    expect(await errorCode(backend.claimRoom('K7QX', {}))).toBe('invalid-value');
    expect(await errorCode(backend.claimRoom('K7QX', { ...META, hostId: '../x' }))).toBe('invalid-value');
    expect(sdk.runTransaction).not.toHaveBeenCalled();
  });

  it('wraps a permission error as BackendError rejected', async () => {
    sdk.state.transaction = async () => {
      throw new Error('PERMISSION_DENIED');
    };
    expect(await errorCode(new FirebaseBackend(CONFIG).claimRoom('K7QX', META))).toBe('rejected');
  });
});

describe('FirebaseBackend reads and writes', () => {
  it('read() returns the snapshot value or null', async () => {
    sdk.state.data['rooms/K7QX/meta'] = { hostId: 'h' };
    const backend = new FirebaseBackend(CONFIG);
    expect(await backend.read('rooms/K7QX/meta')).toEqual({ hostId: 'h' });
    expect(await backend.read('rooms/NONE/meta')).toBeNull();
  });

  it('update() sends one multi-path update at the root with plain values', async () => {
    const backend = new FirebaseBackend(CONFIG);
    await backend.update({
      'rooms/K7QX/meta/status': 'dealt',
      'rooms/K7QX/cards/p1': { role: 'seer' },
      'rooms/K7QX/spares': ['villager', 'werewolf'],
      'rooms/K7QX/night/killed/p2': null,
    });
    expect(sdk.update).toHaveBeenCalledTimes(1);
    const [target, payload] = sdk.update.mock.calls[0] as unknown as [{ path: string }, Record<string, unknown>];
    expect(target.path).toBe('');
    expect(payload).toEqual({
      'rooms/K7QX/meta/status': 'dealt',
      'rooms/K7QX/cards/p1': { role: 'seer' },
      'rooms/K7QX/spares': ['villager', 'werewolf'],
      'rooms/K7QX/night/killed/p2': null,
    });
    expect(Object.getPrototypeOf(payload['rooms/K7QX/cards/p1'])).toBe(Object.prototype);
  });

  it('update() with no writes does nothing', async () => {
    await new FirebaseBackend(CONFIG).update({});
    expect(sdk.update).not.toHaveBeenCalled();
  });

  it('update() rejects overlapping paths, bad paths and bad values without writing', async () => {
    const backend = new FirebaseBackend(CONFIG);
    expect(await errorCode(backend.update({ 'rooms/K7QX': { a: 1 }, 'rooms/K7QX/meta': null }))).toBe('invalid-path');
    expect(await errorCode(backend.update({ 'rooms/../x': 1 }))).toBe('invalid-path');
    expect(await errorCode(backend.update({ 'rooms/K7QX/a': undefined }))).toBe('invalid-value');
    expect(await errorCode(backend.update({ 'rooms/K7QX/a': Number.NaN }))).toBe('invalid-value');
    expect(sdk.update).not.toHaveBeenCalled();
  });

  it('update() wraps a denied write as BackendError rejected', async () => {
    sdk.update.mockRejectedValueOnce(new Error('PERMISSION_DENIED: Permission denied'));
    expect(await errorCode(new FirebaseBackend(CONFIG).update({ 'rooms/K7QX/meta/status': 'day' }))).toBe('rejected');
  });

  it('remove() deletes at the validated path', async () => {
    const backend = new FirebaseBackend(CONFIG);
    await backend.remove('rooms/K7QX');
    expect(sdk.remove).toHaveBeenCalledWith({ path: 'rooms/K7QX' });
    expect(await errorCode(backend.remove('rooms//K7QX'))).toBe('invalid-path');
  });

  it('path validation rejects bad paths everywhere', async () => {
    const backend = new FirebaseBackend(CONFIG);
    for (const bad of ['', 'rooms/', '/rooms', 'rooms/a.b', 'rooms/__proto__', 'rooms/a b', 'rooms/..']) {
      expect(await errorCode(backend.read(bad))).toBe('invalid-path');
      expect(await errorCode(backend.onDisconnect(bad, false))).toBe('invalid-path');
      expect(syncErrorCode(() => backend.subscribe(bad, () => undefined))).toBe('invalid-path');
    }
    expect(sdk.get).not.toHaveBeenCalled();
    expect(sdk.onValue).not.toHaveBeenCalled();
    expect(sdk.onDisconnect).not.toHaveBeenCalled();
  });
});

describe('FirebaseBackend.subscribe', () => {
  it('delivers values (null for absent) until unsubscribed', () => {
    const backend = new FirebaseBackend(CONFIG);
    const seen: unknown[] = [];
    const unsubscribe = backend.subscribe('rooms/K7QX/players', (v) => seen.push(v));
    const listener = sdk.state.listeners[0];
    expect(listener.path).toBe('rooms/K7QX/players');
    listener.next(sdk.snap(null));
    listener.next(sdk.snap({ p1: { name: 'Asha' } }));
    unsubscribe();
    unsubscribe(); // safe twice
    listener.next(sdk.snap({ late: true }));
    expect(seen).toEqual([null, { p1: { name: 'Asha' } }]);
    expect(sdk.unsubscribeValue).toHaveBeenCalledTimes(1);
  });

  it('reports a cancelled listener (e.g. permission denied) through onError once', () => {
    const backend = new FirebaseBackend(CONFIG);
    const seen: unknown[] = [];
    const errors: Error[] = [];
    backend.subscribe('rooms/K7QX/night', (v) => seen.push(v), (e) => errors.push(e));
    const listener = sdk.state.listeners[0];
    listener.error?.(new Error('permission_denied'));
    listener.next(sdk.snap({ killed: { p1: true } }));
    listener.error?.(new Error('again'));
    expect(errors.map((e) => e.message)).toEqual(['permission_denied']);
    expect(seen).toEqual([]);
  });

  it('tolerates a missing onError and non-Error rejections', () => {
    const backend = new FirebaseBackend(CONFIG);
    backend.subscribe('rooms/K7QX/night', () => undefined);
    expect(() => sdk.state.listeners[0].error?.('denied')).not.toThrow();
    const errors: Error[] = [];
    backend.subscribe('rooms/K7QX/spares', () => undefined, (e) => errors.push(e));
    sdk.state.listeners[1].error?.('denied');
    expect(errors[0]).toBeInstanceOf(Error);
  });
});

describe('FirebaseBackend.onDisconnect', () => {
  it('queues the write and cancels it through the handle', async () => {
    const backend = new FirebaseBackend(CONFIG);
    const handle = await backend.onDisconnect('rooms/K7QX/players/p1/connected', false);
    expect(sdk.onDisconnect).toHaveBeenCalledWith({ path: 'rooms/K7QX/players/p1/connected' });
    expect(sdk.odSet).toHaveBeenCalledWith(false);
    await handle.cancel();
    expect(sdk.odCancel).toHaveBeenCalledTimes(1);
  });

  it('rejects an unstorable value and wraps a registration failure', async () => {
    const backend = new FirebaseBackend(CONFIG);
    expect(await errorCode(backend.onDisconnect('rooms/K7QX/players/p1/connected', undefined))).toBe('invalid-value');
    sdk.odSet.mockRejectedValueOnce(new Error('PERMISSION_DENIED'));
    expect(await errorCode(backend.onDisconnect('rooms/K7QX/players/p1/connected', false))).toBe('rejected');
  });
});

describe('getBackend', () => {
  const NAMES = [
    'NEXT_PUBLIC_BACKEND',
    'NEXT_PUBLIC_FIREBASE_API_KEY',
    'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
    'NEXT_PUBLIC_FIREBASE_DATABASE_URL',
    'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
    'NEXT_PUBLIC_FIREBASE_APP_ID',
  ] as const;
  const saved = Object.fromEntries(NAMES.map((n) => [n, process.env[n]]));

  function setFirebaseEnv(): void {
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY = CONFIG.apiKey;
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = CONFIG.authDomain;
    process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL = CONFIG.databaseURL;
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = CONFIG.projectId;
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID = CONFIG.appId;
  }

  beforeEach(() => {
    for (const n of NAMES) delete process.env[n];
  });
  afterEach(() => {
    for (const n of NAMES) {
      if (saved[n] === undefined) delete process.env[n];
      else process.env[n] = saved[n];
    }
    vi.resetModules();
  });

  it('throws BackendNotConfiguredError naming the missing variables, not values', async () => {
    setFirebaseEnv();
    delete process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID = '   ';
    const { getBackend } = await import('@/net/backend');
    const errors = await import('@/net/errors');
    let caught: unknown;
    try {
      getBackend();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(errors.BackendNotConfiguredError);
    const error = caught as BackendNotConfiguredError;
    expect(error.missing).toEqual(['NEXT_PUBLIC_FIREBASE_DATABASE_URL', 'NEXT_PUBLIC_FIREBASE_APP_ID']);
    expect(error.message).toContain('NEXT_PUBLIC_FIREBASE_DATABASE_URL');
    expect(error.message).not.toContain(CONFIG.apiKey);
  });

  it('builds one lazy FirebaseBackend when configured', async () => {
    setFirebaseEnv();
    const { getBackend } = await import('@/net/backend');
    const { FirebaseBackend: Fresh } = await import('@/net/FirebaseBackend');
    const backend = getBackend();
    expect(backend).toBeInstanceOf(Fresh);
    expect(getBackend()).toBe(backend);
    expect(sdk.initializeApp).not.toHaveBeenCalled();
  });

  it('selects the memory backend without needing Firebase config', async () => {
    process.env.NEXT_PUBLIC_BACKEND = 'memory';
    const { getBackend } = await import('@/net/backend');
    const { MemoryBackend } = await import('@/net/MemoryBackend');
    const backend = getBackend();
    try {
      expect(backend).toBeInstanceOf(MemoryBackend);
    } finally {
      await (backend as InstanceType<typeof MemoryBackend>).close();
    }
  });
});
