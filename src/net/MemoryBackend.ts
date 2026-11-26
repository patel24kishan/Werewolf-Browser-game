/**
 * In-memory `RoomBackend`, synced across browser tabs (or across instances in one
 * Node process) with BroadcastChannel. Runs every unit and integration test and
 * local demos (`NEXT_PUBLIC_BACKEND=memory`); it never touches the network.
 *
 * ## How tabs agree on one order of writes
 *
 * Every tab keeps a full replica of the database. One tab at a time is the
 * **leader**: it alone decides the order of writes.
 *
 * - **Leader election** uses the Web Locks API (`navigator.locks`, also in Node
 *   24): every tab queues for the lock `<channel>:leader`; the holder is the
 *   leader. The browser releases a lock when its tab closes or crashes, so the
 *   next tab in the queue takes over without timeouts or heartbeats.
 * - **Writes**: a follower broadcasts a `request` (with a unique request id);
 *   the leader validates it, applies it to its replica and broadcasts a
 *   `commit` with the next sequence number. Every tab, the writer included,
 *   applies commits strictly in sequence order, so all replicas pass through the
 *   same states. A write's promise resolves when its own commit has been
 *   applied locally (subscribers have already been told by then). The leader's
 *   own writes commit synchronously.
 * - **claimRoom** is decided by the leader against its replica, so exactly one
 *   of several concurrent claims for a code wins; the decision is carried in
 *   the commit.
 * - **Late-joining tab**: sends `hello`; the leader replies with a snapshot
 *   (tree, sequence number, epoch). Reads, writes and subscriptions wait until
 *   the tab has a snapshot.
 * - **Failover**: a tab that gets the lock broadcasts `takeover` and waits
 *   `settleMs` for the other tabs' replicas (and the old leader's farewell
 *   snapshot, if it closed cleanly). It adopts the most advanced one (highest
 *   epoch, then sequence number), starts a new epoch, broadcasts the snapshot and
 *   starts serving. Followers adopt it and resend any writes still waiting for
 *   a commit; request ids already in the replicated request log are not
 *   applied twice.
 * - **onDisconnect**: registrations are replicated through commits. Each tab
 *   holds the lock `<channel>:member:<instanceId>` while it is open; the leader
 *   queues for the member lock of every tab with registrations, and when it is
 *   granted (that tab closed or crashed) the leader commits its queued writes.
 *
 * ## Limits (this is a test/demo backend, not a database)
 *
 * - Data lives only while at least one tab is open. Closing every tab loses it.
 * - Failover only waits `settleMs` for replicas. A commit that reached no
 *   surviving tab within that window is lost (in practice: the leader crashed
 *   between applying and broadcasting it, so its writer never got an answer and
 *   resends it).
 * - Without Web Locks (old browsers, or `locks: null`), the first tab that gets
 *   no snapshot within `settleMs` leads for good: there is no failover, two tabs
 *   opened at the same instant can both lead, and onDisconnect writes run only on
 *   a clean `close()`.
 * - Messages from other tabs are same-origin but are still validated and
 *   sanitized like any other untrusted input.
 * - Arrays are stored as leaves: a path cannot address an array item.
 */
import { isSafeId } from '@/game';
import { BackendError } from './errors';
import type { DisconnectHandle, RoomBackend, Unsubscribe } from './RoomBackend';
import { ROOM_CODE_PATTERN } from './roomCode';
import {
  EMPTY_ROOT,
  canonicalJson,
  getAt,
  isObjectNode,
  normalizeWrites,
  parsePath,
  pathsOverlap,
  sanitizeValue,
  setAt,
  type JsonObject,
  type JsonValue,
  type Write,
} from './tree';

// ---------------------------------------------------------------------------
// Injected dependencies
// ---------------------------------------------------------------------------

/** The subset of `BroadcastChannel` the backend uses. */
export interface BroadcastChannelLike {
  postMessage(message: unknown): void;
  close(): void;
  onmessage: ((event: { data: unknown }) => void) | null;
}

/** The subset of the Web Locks `LockManager` the backend uses. */
export interface LockManagerLike {
  request(name: string, options: { signal?: AbortSignal }, callback: () => unknown): Promise<unknown>;
}

/** The subset of `Storage` (sessionStorage) used to keep the guest id per tab. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Options for `new MemoryBackend(...)`. Everything is optional and injectable for tests. */
export interface MemoryBackendOptions {
  /** BroadcastChannel name shared by the tabs that form one database. Default `werewolf-companion-memory`. */
  readonly channelName?: string;
  /** Creates the channel. Return `null` for a single-tab database. Default: global `BroadcastChannel`. */
  readonly createChannel?: (name: string) => BroadcastChannelLike | null;
  /** Lock manager for leader election and disconnect detection. Default `navigator.locks`; `null` disables. */
  readonly locks?: LockManagerLike | null;
  /** Id generator for instance, request and guest ids. Must return safe ids, unique across tabs. Default `crypto.randomUUID`. */
  readonly newId?: () => string;
  /** Fixed guest id for `signIn()` (skips storage). */
  readonly guestId?: string;
  /** Where the per-tab guest id is kept. Default `sessionStorage` when available; `null` disables. */
  readonly storage?: StorageLike | null;
  /** How long a new leader (or a tab without locks) waits for replicas, in ms. Default 50. */
  readonly settleMs?: number;
  /** How long a follower waits for its write to be committed, in ms. Default 10000. */
  readonly requestTimeoutMs?: number;
}

/** sessionStorage key for the per-tab guest id. */
export const GUEST_ID_STORAGE_KEY = 'werewolf.guestId';
/** Default BroadcastChannel name. */
export const DEFAULT_CHANNEL_NAME = 'werewolf-companion-memory';

const LOG_LIMIT = 512;

// ---------------------------------------------------------------------------
// Replicated state and wire formats
// ---------------------------------------------------------------------------

type DisconnectRegistry = Map<string, Map<string, JsonValue>>;

interface Replica {
  epoch: number;
  seq: number;
  tree: JsonObject;
  /** owner instance id → path → value to write when that instance goes away. */
  od: DisconnectRegistry;
  /** request id → result, for de-duplicating resent requests (bounded). */
  log: Map<string, boolean>;
}

interface WireReplica {
  epoch: number;
  seq: number;
  tree: JsonValue;
  od: Array<[string, string, JsonValue]>;
  log: Array<[string, boolean]>;
}

type OdChange =
  | { owner: string; op: 'set'; path: string; value: JsonValue }
  | { owner: string; op: 'cancel'; path: string }
  | { owner: string; op: 'clear' };

interface Commit {
  epoch: number;
  seq: number;
  reqId: string | null;
  requester: string;
  writes: Array<[string, JsonValue]>;
  od: OdChange | null;
  result: boolean;
}

/** An operation submitted to the leader. */
type Op =
  | { kind: 'update'; writes: Write[] }
  | { kind: 'claim'; path: string; value: JsonValue }
  | { kind: 'odSet'; path: string; value: JsonValue }
  | { kind: 'odCancel'; path: string }
  | { kind: 'odFire' };

type WireOp =
  | { kind: 'update'; writes: Record<string, JsonValue> }
  | { kind: 'claim'; path: string; value: JsonValue }
  | { kind: 'odSet'; path: string; value: JsonValue }
  | { kind: 'odCancel'; path: string }
  | { kind: 'odFire' };

function emptyReplica(): Replica {
  return { epoch: 0, seq: 0, tree: EMPTY_ROOT, od: new Map(), log: new Map() };
}

function compareReplicas(a: { epoch: number; seq: number }, b: { epoch: number; seq: number }): number {
  return a.epoch !== b.epoch ? a.epoch - b.epoch : a.seq - b.seq;
}

function toWireReplica(r: Replica): WireReplica {
  const od: Array<[string, string, JsonValue]> = [];
  for (const [owner, paths] of r.od) for (const [path, value] of paths) od.push([owner, path, value]);
  return { epoch: r.epoch, seq: r.seq, tree: r.tree, od, log: [...r.log] };
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return isObjectNode(value) ? (value as Record<string, unknown>) : null;
}

/** Validates a replica received from another tab. @throws on anything malformed. */
function parseWireReplica(raw: unknown): Replica {
  const obj = asRecord(raw);
  if (!obj || !isCount(obj.epoch) || !isCount(obj.seq) || !Array.isArray(obj.od) || !Array.isArray(obj.log)) {
    throw new BackendError('rejected', 'Malformed replica.');
  }
  const tree = sanitizeValue(obj.tree);
  if (tree !== null && !isObjectNode(tree)) throw new BackendError('rejected', 'Malformed tree.');
  const od: DisconnectRegistry = new Map();
  for (const entry of obj.od as unknown[]) {
    if (!Array.isArray(entry) || entry.length !== 3 || !isSafeId(entry[0])) {
      throw new BackendError('rejected', 'Malformed disconnect entry.');
    }
    const path = parsePath(entry[1]).join('/');
    const paths = od.get(entry[0]) ?? new Map<string, JsonValue>();
    paths.set(path, sanitizeValue(entry[2]));
    od.set(entry[0], paths);
  }
  const log = new Map<string, boolean>();
  for (const entry of (obj.log as unknown[]).slice(-LOG_LIMIT)) {
    if (!Array.isArray(entry) || entry.length !== 2 || !isSafeId(entry[0]) || typeof entry[1] !== 'boolean') {
      throw new BackendError('rejected', 'Malformed request log.');
    }
    log.set(entry[0], entry[1]);
  }
  return { epoch: obj.epoch, seq: obj.seq, tree: tree ?? EMPTY_ROOT, od, log };
}

function toWireOp(op: Op): WireOp {
  if (op.kind === 'update') {
    const writes: Record<string, JsonValue> = {};
    for (const w of op.writes) writes[w.path] = w.value;
    return { kind: 'update', writes };
  }
  return op;
}

/** Validates an operation received from another tab. @throws on anything malformed. */
function parseWireOp(raw: unknown): Op {
  const obj = asRecord(raw);
  if (!obj) throw new BackendError('rejected', 'Malformed operation.');
  switch (obj.kind) {
    case 'update':
      return { kind: 'update', writes: normalizeWrites(obj.writes) };
    case 'claim': {
      const path = parsePath(obj.path).join('/');
      const value = sanitizeValue(obj.value);
      if (!isObjectNode(value)) throw new BackendError('invalid-value', 'A claim needs an object value.');
      return { kind: 'claim', path, value };
    }
    case 'odSet':
      return { kind: 'odSet', path: parsePath(obj.path).join('/'), value: sanitizeValue(obj.value) };
    case 'odCancel':
      return { kind: 'odCancel', path: parsePath(obj.path).join('/') };
    case 'odFire':
      return { kind: 'odFire' };
    default:
      throw new BackendError('rejected', 'Unknown operation.');
  }
}

/** Validates a commit received from the leader. @throws on anything malformed. */
function parseCommit(raw: unknown): Commit {
  const obj = asRecord(raw);
  if (
    !obj ||
    !isCount(obj.epoch) ||
    !isCount(obj.seq) ||
    !(obj.reqId === null || isSafeId(obj.reqId)) ||
    !isSafeId(obj.requester) ||
    !Array.isArray(obj.writes) ||
    typeof obj.result !== 'boolean'
  ) {
    throw new BackendError('rejected', 'Malformed commit.');
  }
  const writes: Array<[string, JsonValue]> = [];
  for (const entry of obj.writes as unknown[]) {
    if (!Array.isArray(entry) || entry.length !== 2) throw new BackendError('rejected', 'Malformed write.');
    writes.push([parsePath(entry[0]).join('/'), sanitizeValue(entry[1])]);
  }
  let od: OdChange | null = null;
  const rawOd = obj.od === null ? null : asRecord(obj.od);
  if (obj.od !== null) {
    if (!rawOd || !isSafeId(rawOd.owner)) throw new BackendError('rejected', 'Malformed disconnect change.');
    if (rawOd.op === 'set') {
      od = { owner: rawOd.owner, op: 'set', path: parsePath(rawOd.path).join('/'), value: sanitizeValue(rawOd.value) };
    } else if (rawOd.op === 'cancel') {
      od = { owner: rawOd.owner, op: 'cancel', path: parsePath(rawOd.path).join('/') };
    } else if (rawOd.op === 'clear') {
      od = { owner: rawOd.owner, op: 'clear' };
    } else {
      throw new BackendError('rejected', 'Malformed disconnect change.');
    }
  }
  return {
    epoch: obj.epoch,
    seq: obj.seq,
    reqId: obj.reqId as string | null,
    requester: obj.requester as string,
    writes,
    od,
    result: obj.result,
  };
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

function defaultChannel(name: string): BroadcastChannelLike | null {
  if (typeof BroadcastChannel !== 'function') return null;
  return new BroadcastChannel(name) as unknown as BroadcastChannelLike;
}

function defaultLocks(): LockManagerLike | null {
  const nav = (globalThis as { navigator?: { locks?: LockManagerLike } }).navigator;
  return nav?.locks ?? null;
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  } catch {
    return null; // some privacy modes throw on access
  }
}

function defaultNewId(): string {
  return globalThis.crypto.randomUUID();
}

function reportCallbackError(error: unknown): void {
  console.error('MemoryBackend subscriber threw:', error);
}

// ---------------------------------------------------------------------------
// The backend
// ---------------------------------------------------------------------------

type Role = 'starting' | 'follower' | 'settling' | 'leader';

interface Subscription {
  readonly segments: readonly string[];
  readonly onValue: (value: unknown) => void;
  last: string | undefined;
  active: boolean;
}

interface PendingRequest {
  readonly wire: WireOp;
  readonly resolve: (result: boolean) => void;
  readonly reject: (error: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

interface QueuedOp {
  readonly op: Op;
  readonly owner: string;
  readonly reqId: string | null;
  readonly resolve?: (result: boolean) => void;
  readonly reject?: (error: Error) => void;
}

/**
 * An in-memory database replica that syncs with every other `MemoryBackend` on
 * the same channel name. See the file comment for the ordering design and its
 * limits. Call `close()` when done (tests) or let the tab close (browser).
 */
export class MemoryBackend implements RoomBackend {
  /** Id of this replica (one per tab/instance); not the guest id. */
  readonly instanceId: string;

  private readonly channelName: string;
  private readonly channel: BroadcastChannelLike | null;
  private readonly locks: LockManagerLike | null;
  private readonly newId: () => string;
  private readonly storage: StorageLike | null;
  private readonly settleMs: number;
  private readonly requestTimeoutMs: number;
  private guestId: string | null;

  private role: Role = 'starting';
  private replica: Replica = emptyReplica();
  private isReady = false;
  private closed = false;
  private readonly readyPromise: Promise<void>;
  private markReady!: () => void;
  private readonly held: Promise<void>;
  private releaseHeld!: () => void;
  private readonly abort = new AbortController();

  private readonly subs = new Set<Subscription>();
  private readonly pending = new Map<string, PendingRequest>();
  private queued: QueuedOp[] = [];
  private candidates: Replica[] = [];
  private farewell: Replica | null = null;
  private readonly watching = new Set<string>();

  constructor(options: MemoryBackendOptions = {}) {
    this.channelName = options.channelName ?? DEFAULT_CHANNEL_NAME;
    this.newId = options.newId ?? defaultNewId;
    this.storage = options.storage === undefined ? defaultStorage() : options.storage;
    this.settleMs = options.settleMs ?? 50;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 10_000;
    this.guestId = options.guestId ?? null;
    if (this.guestId !== null && !isSafeId(this.guestId)) throw new BackendError('rejected', 'guestId must be a safe id.');
    this.instanceId = this.makeId();
    this.channel = (options.createChannel ?? defaultChannel)(this.channelName);
    this.locks = this.channel === null ? null : options.locks === undefined ? defaultLocks() : options.locks;
    this.readyPromise = new Promise((resolve) => {
      this.markReady = resolve;
    });
    this.held = new Promise((resolve) => {
      this.releaseHeld = resolve;
    });
    void this.start();
  }

  /** True when this replica currently orders writes. */
  get isLeader(): boolean {
    return this.role === 'leader';
  }

  /** Resolves once this replica has data (its own as leader, or a snapshot). */
  whenReady(): Promise<void> {
    return this.readyPromise;
  }

  // ----- RoomBackend -------------------------------------------------------

  /** The per-tab guest id: injected, else kept in sessionStorage, else generated. */
  async signIn(): Promise<string> {
    if (this.guestId !== null) return this.guestId;
    let id: string | null = null;
    try {
      const stored = this.storage?.getItem(GUEST_ID_STORAGE_KEY) ?? null;
      if (isSafeId(stored)) id = stored;
    } catch {
      // storage unavailable: fall through to a fresh id
    }
    if (id === null) {
      id = this.makeId();
      try {
        this.storage?.setItem(GUEST_ID_STORAGE_KEY, id);
      } catch {
        // ignore: the id just won't survive a refresh
      }
    }
    this.guestId = id;
    return id;
  }

  /** Atomic create-if-absent of `rooms/{code}/meta`, decided by the leader. */
  async claimRoom(code: string, meta: Readonly<Record<string, unknown>>): Promise<boolean> {
    if (typeof code !== 'string' || !ROOM_CODE_PATTERN.test(code)) {
      throw new BackendError('invalid-code', 'Room codes must match ROOM_CODE_PATTERN.');
    }
    const value = sanitizeValue(meta);
    if (!isObjectNode(value)) throw new BackendError('invalid-value', 'Room meta must be a non-empty object.');
    return this.submit({ kind: 'claim', path: `rooms/${code}/meta`, value });
  }

  /** Reads the value at `path` once this replica is ready. */
  async read(path: string): Promise<unknown> {
    const segments = parsePath(path);
    await this.whenOpenAndReady();
    return getAt(this.replica.tree, segments);
  }

  /** Listens to `path`; see `RoomBackend.subscribe`. Delivered values are frozen. */
  subscribe(path: string, onValue: (value: unknown) => void, onError?: (error: Error) => void): Unsubscribe {
    void onError; // the memory backend has no permission errors
    const sub: Subscription = { segments: parsePath(path), onValue, last: undefined, active: true };
    this.subs.add(sub);
    void this.readyPromise.then(() => {
      if (sub.active && !this.closed) this.deliver(sub);
    });
    return () => {
      sub.active = false;
      this.subs.delete(sub);
    };
  }

  /** Atomic multi-path write; rejects the whole update on any invalid path or value. */
  async update(writes: Readonly<Record<string, unknown>>): Promise<void> {
    const normalized = normalizeWrites(writes);
    if (normalized.length === 0) return;
    await this.submit({ kind: 'update', writes: normalized });
  }

  /** Deletes the value at `path`. */
  async remove(path: string): Promise<void> {
    await this.update({ [path]: null });
  }

  /** Queues a write for when this instance closes or its tab dies. */
  async onDisconnect(path: string, value: unknown): Promise<DisconnectHandle> {
    const normalized = parsePath(path).join('/');
    const clean = sanitizeValue(value);
    await this.submit({ kind: 'odSet', path: normalized, value: clean });
    return {
      cancel: async () => {
        if (this.closed) return;
        await this.submit({ kind: 'odCancel', path: normalized });
      },
    };
  }

  /**
   * Disconnects this replica, as if its tab closed: queued onDisconnect writes
   * run (on the next leader, or on the remaining leader), pending writes reject
   * with `closed`, listeners stop and the locks and channel are released.
   */
  async close(): Promise<void> {
    if (this.closed) return;
    if (this.locks === null && this.isReady) {
      // No member locks to detect the disconnect: flush our own writes now.
      if (this.role === 'leader') this.execute({ kind: 'odFire' }, this.instanceId, null);
      else if (this.channel) this.post({ type: 'request', reqId: this.makeId(), op: { kind: 'odFire' } });
    }
    if (this.role === 'leader' && this.channel) {
      this.post({ type: 'state', to: '*', replica: toWireReplica(this.replica) });
    }
    this.closed = true;
    this.abort.abort();
    this.releaseHeld();
    for (const [reqId, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new BackendError('closed', 'The backend was closed.'));
      this.pending.delete(reqId);
    }
    for (const q of this.queued) q.reject?.(new BackendError('closed', 'The backend was closed.'));
    this.queued = [];
    for (const sub of this.subs) sub.active = false;
    this.subs.clear();
    if (this.channel) {
      this.channel.onmessage = null;
      this.channel.close();
    }
  }

  // ----- Start-up and leadership ------------------------------------------

  private async start(): Promise<void> {
    if (this.channel === null) {
      this.role = 'leader';
      this.setReady();
      return;
    }
    this.channel.onmessage = (event) => this.onMessage(event?.data);
    if (this.locks) {
      // Hold our member lock first, so a leader watching it never sees it free while we live.
      await this.holdLock(`${this.channelName}:member:${this.instanceId}`);
      if (this.closed) return;
      this.role = 'follower';
      this.locks
        .request(`${this.channelName}:leader`, { signal: this.abort.signal }, () => {
          if (this.closed) return undefined;
          void this.takeOver();
          return this.held;
        })
        .catch(() => undefined);
      this.post({ type: 'hello' });
    } else {
      this.role = 'follower';
      this.post({ type: 'hello' });
      setTimeout(() => {
        if (!this.closed && !this.isReady && this.role === 'follower') void this.takeOver();
      }, this.settleMs);
    }
  }

  private holdLock(name: string): Promise<void> {
    return new Promise((resolve) => {
      this.locks!.request(name, { signal: this.abort.signal }, () => {
        resolve();
        return this.held;
      }).catch(() => resolve());
    });
  }

  private async takeOver(): Promise<void> {
    this.role = 'settling';
    this.candidates = this.farewell ? [this.farewell] : [];
    this.post({ type: 'takeover' });
    await new Promise((resolve) => setTimeout(resolve, this.settleMs));
    if (this.closed) return;

    let best: Replica | null = null;
    for (const c of this.candidates) if (best === null || compareReplicas(c, best) > 0) best = c;
    const maxEpoch = Math.max(this.replica.epoch, ...this.candidates.map((c) => c.epoch));
    if (best !== null && (!this.isReady || compareReplicas(best, this.replica) > 0)) this.adopt(best);
    this.candidates = [];
    this.farewell = null;
    this.replica.epoch = maxEpoch + 1;
    this.role = 'leader';
    this.setReady();
    this.post({ type: 'snapshot', to: '*', replica: toWireReplica(this.replica) });

    // Our own writes that were waiting for the old leader.
    for (const [reqId, p] of [...this.pending]) {
      this.pending.delete(reqId);
      clearTimeout(p.timer);
      const done = this.replica.log.get(reqId);
      if (done !== undefined) p.resolve(done);
      else p.resolve(this.execute(parseWireOp(p.wire), this.instanceId, reqId));
    }
    const queued = this.queued;
    this.queued = [];
    for (const q of queued) this.runQueued(q);
    for (const owner of this.replica.od.keys()) this.watch(owner);
  }

  private setReady(): void {
    if (this.isReady) return;
    this.isReady = true;
    this.markReady();
  }

  private async whenOpenAndReady(): Promise<void> {
    if (this.closed) throw new BackendError('closed', 'The backend was closed.');
    await this.readyPromise;
    if (this.closed) throw new BackendError('closed', 'The backend was closed.');
  }

  /** Leader: wait for `owner`'s member lock, i.e. for that instance to go away. */
  private watch(owner: string): void {
    if (!this.locks || owner === this.instanceId || this.watching.has(owner)) return;
    this.watching.add(owner);
    this.locks
      .request(`${this.channelName}:member:${owner}`, { signal: this.abort.signal }, () => {
        this.watching.delete(owner);
        if (!this.closed && this.role === 'leader') this.execute({ kind: 'odFire' }, owner, null);
        return undefined;
      })
      .catch(() => this.watching.delete(owner));
  }

  // ----- Submitting and executing operations -------------------------------

  private async submit(op: Op): Promise<boolean> {
    await this.whenOpenAndReady();
    if (this.role === 'leader') return this.execute(op, this.instanceId, null);
    if (this.role === 'settling') {
      return new Promise((resolve, reject) =>
        this.queued.push({ op, owner: this.instanceId, reqId: null, resolve, reject }),
      );
    }
    const reqId = this.makeId();
    const wire = toWireOp(op);
    return new Promise<boolean>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(reqId);
        reject(new BackendError('timeout', 'No leader committed the write in time.'));
      }, this.requestTimeoutMs);
      this.pending.set(reqId, { wire, resolve, reject, timer });
      this.post({ type: 'request', reqId, op: wire });
    });
  }

  private runQueued(q: QueuedOp): void {
    if (q.reqId !== null) {
      const done = this.replica.log.get(q.reqId);
      if (done !== undefined) {
        this.post({ type: 'ack', to: q.owner, reqId: q.reqId, result: done });
        return;
      }
    }
    const result = this.execute(q.op, q.owner, q.reqId);
    q.resolve?.(result);
  }

  /** Leader only: decide an operation, apply it locally and broadcast the commit. */
  private execute(op: Op, owner: string, reqId: string | null): boolean {
    const r = this.replica;
    let writes: Array<[string, JsonValue]> = [];
    let od: OdChange | null = null;
    let result = true;
    switch (op.kind) {
      case 'update':
        writes = op.writes.map((w) => [w.path, w.value]);
        break;
      case 'claim':
        if (getAt(r.tree, op.path.split('/')) === null) writes = [[op.path, op.value]];
        else result = false;
        break;
      case 'odSet':
        od = { owner, op: 'set', path: op.path, value: op.value };
        break;
      case 'odCancel':
        od = { owner, op: 'cancel', path: op.path };
        break;
      case 'odFire': {
        const paths = r.od.get(owner);
        if (!paths) return true;
        writes = [...paths];
        od = { owner, op: 'clear' };
        break;
      }
    }
    const commit: Commit = { epoch: r.epoch, seq: r.seq + 1, reqId, requester: owner, writes, od, result };
    this.applyCommit(commit);
    this.post({ type: 'commit', commit });
    if (od?.op === 'set') this.watch(owner);
    return result;
  }

  private applyCommit(c: Commit): void {
    const r = this.replica;
    const touched: string[][] = [];
    for (const [path, value] of c.writes) {
      const segments = path.split('/');
      r.tree = setAt(r.tree, segments, value);
      touched.push(segments);
    }
    if (c.od) {
      const paths = r.od.get(c.od.owner);
      if (c.od.op === 'set') {
        const next = paths ?? new Map<string, JsonValue>();
        next.set(c.od.path, c.od.value);
        r.od.set(c.od.owner, next);
      } else if (c.od.op === 'cancel') {
        paths?.delete(c.od.path);
        if (paths && paths.size === 0) r.od.delete(c.od.owner);
      } else {
        r.od.delete(c.od.owner);
      }
    }
    r.seq = c.seq;
    if (c.reqId !== null) {
      r.log.set(c.reqId, c.result);
      if (r.log.size > LOG_LIMIT) r.log.delete(r.log.keys().next().value as string);
    }
    this.notify(touched);
    if (c.reqId !== null && c.requester === this.instanceId) this.settle(c.reqId, c.result);
  }

  private settle(reqId: string, result: boolean): void {
    const p = this.pending.get(reqId);
    if (!p) return;
    this.pending.delete(reqId);
    clearTimeout(p.timer);
    p.resolve(result);
  }

  private adopt(next: Replica): void {
    this.replica = next;
    this.notify(null);
  }

  // ----- Subscriptions ----------------------------------------------------

  private notify(touched: readonly (readonly string[])[] | null): void {
    if (!this.isReady && this.role !== 'settling') return;
    for (const sub of [...this.subs]) {
      if (!sub.active) continue;
      if (touched !== null && !touched.some((t) => pathsOverlap(t, sub.segments))) continue;
      this.deliver(sub);
    }
  }

  private deliver(sub: Subscription): void {
    const value = getAt(this.replica.tree, sub.segments);
    const key = canonicalJson(value);
    if (key === sub.last) return;
    sub.last = key;
    try {
      sub.onValue(value);
    } catch (error) {
      reportCallbackError(error);
    }
  }

  // ----- Messages ---------------------------------------------------------

  private post(message: Record<string, unknown>): void {
    if (this.closed || !this.channel) return;
    try {
      this.channel.postMessage({ ...message, from: this.instanceId });
    } catch (error) {
      reportCallbackError(error);
    }
  }

  private onMessage(data: unknown): void {
    if (this.closed) return;
    const msg = asRecord(data);
    if (!msg || typeof msg.type !== 'string' || !isSafeId(msg.from) || msg.from === this.instanceId) return;
    const from = msg.from;
    const toMe = msg.to === this.instanceId || msg.to === '*';
    try {
      switch (msg.type) {
        case 'hello':
          if (this.role === 'leader') this.post({ type: 'snapshot', to: from, replica: toWireReplica(this.replica) });
          break;
        case 'takeover':
          if (this.isReady && this.role === 'follower') {
            this.post({ type: 'state', to: from, replica: toWireReplica(this.replica) });
          }
          break;
        case 'state':
          if (!toMe) break;
          if (this.role === 'settling') this.candidates.push(parseWireReplica(msg.replica));
          else if (msg.to === '*' && this.role === 'follower') this.farewell = parseWireReplica(msg.replica);
          break;
        case 'snapshot':
          if (toMe && (this.role === 'follower' || this.role === 'starting')) this.onSnapshot(parseWireReplica(msg.replica));
          break;
        case 'commit':
          if (this.role === 'follower' || this.role === 'settling') this.onCommit(parseCommit(msg.commit));
          break;
        case 'request':
          this.onRequest(from, msg.reqId, msg.op);
          break;
        case 'ack':
          if (msg.to === this.instanceId && isSafeId(msg.reqId) && typeof msg.result === 'boolean') {
            this.settle(msg.reqId, msg.result);
          }
          break;
        case 'nack':
          if (msg.to === this.instanceId && isSafeId(msg.reqId)) {
            const p = this.pending.get(msg.reqId);
            if (p) {
              this.pending.delete(msg.reqId);
              clearTimeout(p.timer);
              p.reject(new BackendError('rejected', typeof msg.message === 'string' ? msg.message : 'Write rejected.'));
            }
          }
          break;
        default:
          break;
      }
    } catch {
      // Malformed message from another tab: ignore it.
    }
  }

  private onSnapshot(next: Replica): void {
    const epochChanged = next.epoch !== this.replica.epoch;
    if (this.isReady && compareReplicas(next, this.replica) < 0) return;
    this.farewell = null;
    this.replica = next;
    const wasReady = this.isReady;
    this.setReady();
    if (wasReady) this.notify(null);
    for (const [reqId, p] of [...this.pending]) {
      const done = next.log.get(reqId);
      if (done !== undefined) this.settle(reqId, done);
      else if (epochChanged) this.post({ type: 'request', reqId, op: p.wire });
    }
  }

  private onCommit(c: Commit): void {
    if (!this.isReady) return; // the snapshot we are waiting for already includes it
    if (c.epoch < this.replica.epoch) return;
    if (c.epoch > this.replica.epoch || c.seq > this.replica.seq + 1) {
      this.post({ type: 'hello' }); // missed something: ask for a fresh snapshot
      return;
    }
    if (c.seq <= this.replica.seq) return; // duplicate
    this.applyCommit(c);
  }

  private onRequest(from: string, reqId: unknown, rawOp: unknown): void {
    if (this.role !== 'leader' && this.role !== 'settling') return;
    if (!isSafeId(reqId)) return;
    let op: Op;
    try {
      op = parseWireOp(rawOp);
    } catch (error) {
      this.post({ type: 'nack', to: from, reqId, message: error instanceof Error ? error.message : 'Invalid write.' });
      return;
    }
    const q: QueuedOp = { op, owner: from, reqId };
    if (this.role === 'settling') this.queued.push(q);
    else this.runQueued(q);
  }

  private makeId(): string {
    const id = this.newId();
    if (!isSafeId(id)) throw new BackendError('rejected', 'newId() must return safe ids.');
    return id;
  }
}
