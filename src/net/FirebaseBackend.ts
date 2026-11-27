/**
 * `RoomBackend` on Firebase Anonymous Auth + Realtime Database (modular SDK).
 * Used by the real app; every test runs on `MemoryBackend` or mocks the SDK.
 *
 * - **Guests.** `signIn` first waits for the persisted user (browsers keep it in
 *   local persistence by default, so a refresh keeps the same uid) and only
 *   signs in anonymously when there is none.
 * - **Same validation as the memory backend.** Paths go through `parsePath`,
 *   updates through `normalizeWrites` and values through `sanitizeValue`, so an
 *   invalid path or value is rejected before anything reaches the network.
 * - **Security is enforced by `database.rules.json`, not here.** A write the
 *   rules deny rejects with a `BackendError` of code `rejected`.
 * - **Lazy.** Nothing touches Firebase until the first call, so constructing
 *   this in a static-export bundle (or during prerendering) is harmless.
 * - Call `signIn` and wait for it before reading or listening: the rules deny
 *   every read from a client that is not signed in.
 */
import { deleteApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  inMemoryPersistence,
  initializeAuth,
  onAuthStateChanged,
  signInAnonymously,
  type Auth,
  type User,
} from 'firebase/auth';
import {
  get,
  getDatabase,
  goOffline,
  onDisconnect as fbOnDisconnect,
  onValue as fbOnValue,
  ref,
  remove as fbRemove,
  runTransaction,
  update as fbUpdate,
  type Database,
} from 'firebase/database';
import { isSafeId } from '@/game';
import { BackendError } from './errors';
import type { DisconnectHandle, RoomBackend, Unsubscribe } from './RoomBackend';
import { ROOM_CODE_PATTERN } from './roomCode';
import { isObjectNode, normalizeWrites, parsePath, sanitizeValue, type JsonValue } from './tree';

/** The Firebase web-app settings the backend needs (all public client config, not secrets). */
export interface FirebaseConfig {
  readonly apiKey: string;
  readonly authDomain: string;
  readonly databaseURL: string;
  readonly projectId: string;
  readonly appId: string;
}

/** Options for `FirebaseBackend`. */
export interface FirebaseBackendOptions {
  /**
   * Firebase app name. Default: the default app. Give each instance its own
   * name to run several guests in one process (the live rules check does).
   */
  readonly appName?: string;
  /**
   * `local` (default): the SDK's default persistence (kept across refreshes in
   * a browser). `memory`: in-memory only, for Node scripts and tests.
   */
  readonly persistence?: 'local' | 'memory';
}

interface Services {
  readonly app: FirebaseApp;
  readonly auth: Auth;
  readonly db: Database;
}

/** Converts a sanitized (null-prototype, frozen) value into plain JSON for the SDK. */
function toPlain(value: JsonValue): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(toPlain);
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value)) out[key] = toPlain((value as Record<string, JsonValue>)[key]);
  return out;
}

/** Wraps an SDK failure (e.g. PERMISSION_DENIED) as a `BackendError`; keeps `BackendError`s as they are. */
function wrapError(error: unknown, what: string): BackendError {
  if (error instanceof BackendError) return error;
  const detail = error instanceof Error && error.message ? error.message : 'unknown error';
  const wrapped = new BackendError('rejected', `${what} failed: ${detail}`);
  (wrapped as { cause?: unknown }).cause = error;
  return wrapped;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/** The real-app backend. Construct once (see `getBackend`) and reuse. */
export class FirebaseBackend implements RoomBackend {
  private services: Services | null = null;
  private ownsApp = false;
  private signInPromise: Promise<string> | null = null;
  private closed = false;

  constructor(
    private readonly config: FirebaseConfig,
    private readonly options: FirebaseBackendOptions = {},
  ) {}

  /** Initializes the app, auth and database once. */
  private init(): Services {
    if (this.closed) throw new BackendError('closed', 'This backend has been closed.');
    if (this.services) return this.services;
    const name = this.options.appName;
    const existing = getApps().find((a) => a.name === (name ?? '[DEFAULT]'));
    const app = existing ?? (name === undefined ? initializeApp({ ...this.config }) : initializeApp({ ...this.config }, name));
    this.ownsApp = existing === undefined;
    const auth =
      this.options.persistence === 'memory' && this.ownsApp
        ? initializeAuth(app, { persistence: inMemoryPersistence })
        : getAuth(app);
    const db = getDatabase(app, this.config.databaseURL);
    this.services = { app, auth, db };
    return this.services;
  }

  /** The current user restored from persistence, or null (waits for the first auth state). */
  private currentUser(auth: Auth): Promise<User | null> {
    return new Promise<User | null>((resolve, reject) => {
      let settled = false;
      let unsubscribe: (() => void) | null = null;
      const finish = (fn: () => void): void => {
        if (settled) return;
        settled = true;
        fn();
        unsubscribe?.();
      };
      unsubscribe = onAuthStateChanged(
        auth,
        (user) => finish(() => resolve(user)),
        (error) => finish(() => reject(error)),
      );
      if (settled) unsubscribe(); // the callback fired synchronously
    });
  }

  /** Resolves with this guest's uid, reusing the persisted user when there is one. */
  signIn(): Promise<string> {
    if (!this.signInPromise) {
      this.signInPromise = this.doSignIn().catch((error: unknown) => {
        this.signInPromise = null; // allow a retry (e.g. it failed while offline)
        throw wrapError(error, 'Sign-in');
      });
    }
    return this.signInPromise;
  }

  private async doSignIn(): Promise<string> {
    const { auth } = this.init();
    const user = (await this.currentUser(auth)) ?? (await signInAnonymously(auth)).user;
    if (!isSafeId(user.uid)) throw new BackendError('rejected', 'The guest id from Firebase is not a safe id.');
    return user.uid;
  }

  /**
   * Create-if-absent of `rooms/{code}/meta` in a transaction. The update
   * function aborts when meta already exists, so a taken code is never written.
   * `true` only when the transaction committed and the stored meta has our hostId.
   */
  async claimRoom(code: string, meta: Readonly<Record<string, unknown>>): Promise<boolean> {
    if (typeof code !== 'string' || !ROOM_CODE_PATTERN.test(code)) {
      throw new BackendError('invalid-code', 'Room codes must match ROOM_CODE_PATTERN.');
    }
    const value = sanitizeValue(meta);
    if (!isObjectNode(value)) throw new BackendError('invalid-value', 'Room meta must be a non-empty object.');
    const hostId = value.hostId;
    if (!isSafeId(hostId)) throw new BackendError('invalid-value', 'Room meta needs a safe hostId.');
    const plain = toPlain(value);
    const { db } = this.init();
    const metaRef = ref(db, `rooms/${code}/meta`);
    const takenBySomeoneElse = async (): Promise<boolean> => {
      const existing: unknown = (await get(metaRef)).val();
      return isObjectNode(existing) && existing.hostId !== hostId;
    };
    try {
      // A cheap pre-check: the transaction's first attempt runs on the local
      // cache (usually empty), which the rules would deny for a taken code.
      if (await takenBySomeoneElse()) return false;
      const result = await runTransaction(
        metaRef,
        (current: unknown) => (current === null || current === undefined ? plain : undefined),
        { applyLocally: false },
      );
      if (!result.committed) return false;
      const stored: unknown = result.snapshot.val();
      return isObjectNode(stored) && stored.hostId === hostId;
    } catch (error) {
      // Lost a race: someone created meta between the pre-check and our write,
      // so the rules denied it. That is "taken", not a failure.
      try {
        if (await takenBySomeoneElse()) return false;
      } catch {
        // fall through to the original error
      }
      throw wrapError(error, 'Claiming the room');
    }
  }

  async read(path: string): Promise<unknown> {
    const segments = parsePath(path);
    const { db } = this.init();
    try {
      const snapshot = await get(ref(db, segments.join('/')));
      return snapshot.val() ?? null;
    } catch (error) {
      throw wrapError(error, 'Reading');
    }
  }

  subscribe(path: string, onValue: (value: unknown) => void, onError?: (error: Error) => void): Unsubscribe {
    const segments = parsePath(path);
    const { db } = this.init();
    let active = true;
    const stop = fbOnValue(
      ref(db, segments.join('/')),
      (snapshot) => {
        if (active) onValue(snapshot.val() ?? null);
      },
      (error) => {
        // The SDK has already dropped the listener when it cancels it.
        if (!active) return;
        active = false;
        onError?.(asError(error));
      },
    );
    let stopped = false;
    return () => {
      active = false;
      if (stopped) return;
      stopped = true;
      stop();
    };
  }

  async update(writes: Readonly<Record<string, unknown>>): Promise<void> {
    const normalized = normalizeWrites(writes);
    if (normalized.length === 0) return;
    const payload: Record<string, unknown> = {};
    for (const write of normalized) payload[write.path] = toPlain(write.value);
    const { db } = this.init();
    try {
      await fbUpdate(ref(db), payload);
    } catch (error) {
      throw wrapError(error, 'Writing');
    }
  }

  async remove(path: string): Promise<void> {
    const segments = parsePath(path);
    const { db } = this.init();
    try {
      await fbRemove(ref(db, segments.join('/')));
    } catch (error) {
      throw wrapError(error, 'Deleting');
    }
  }

  async onDisconnect(path: string, value: unknown): Promise<DisconnectHandle> {
    const segments = parsePath(path);
    const plain = toPlain(sanitizeValue(value));
    const { db } = this.init();
    const queued = fbOnDisconnect(ref(db, segments.join('/')));
    try {
      await queued.set(plain);
    } catch (error) {
      throw wrapError(error, 'Registering the disconnect write');
    }
    return {
      cancel: async () => {
        if (this.closed) return;
        try {
          await queued.cancel();
        } catch (error) {
          throw wrapError(error, 'Cancelling the disconnect write');
        }
      },
    };
  }

  /**
   * Disconnects and deletes the Firebase app if this instance created it.
   * Queued onDisconnect writes run on the server once the connection drops.
   */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const services = this.services;
    this.services = null;
    if (!services) return;
    goOffline(services.db);
    if (this.ownsApp) await deleteApp(services.app);
  }
}
