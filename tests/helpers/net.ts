/**
 * Test helpers for `src/net`: deterministic ids, MemoryBackend "tabs" on a
 * private BroadcastChannel name, polling, and a backend wrapper that records
 * every path a client reads, subscribes to and writes.
 */
import { randomUUID } from 'node:crypto';
import { MemoryBackend, type MemoryBackendOptions } from '@/net/MemoryBackend';
import type { DisconnectHandle, RoomBackend, Unsubscribe } from '@/net/RoomBackend';

/** A channel name no other test (or test file, or worker) uses. */
export function uniqueChannel(prefix = 'test'): string {
  return `${prefix}-${randomUUID()}`;
}

/** Deterministic id generator: `${prefix}-1`, `${prefix}-2`, ... */
export function idGen(prefix: string): () => string {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

/** Keeps track of backends so a test can close them all in `afterEach`. */
export class TabPool {
  private readonly tabs: MemoryBackend[] = [];

  constructor(readonly channelName: string = uniqueChannel()) {}

  /** A new tab on this pool's channel. `name` seeds its deterministic ids. */
  open(name: string, options: MemoryBackendOptions = {}): MemoryBackend {
    const tab = new MemoryBackend({
      channelName: this.channelName,
      newId: idGen(name),
      storage: null,
      settleMs: 15,
      requestTimeoutMs: 3000,
      ...options,
    });
    this.tabs.push(tab);
    return tab;
  }

  /** Closes every tab opened by this pool. */
  async closeAll(): Promise<void> {
    await Promise.all(this.tabs.splice(0).map((t) => t.close()));
  }
}

/** Polls `predicate` until it is truthy (returns its value) or fails after `timeoutMs`. */
export async function waitFor<T>(
  predicate: () => T | Promise<T>,
  timeoutMs = 3000,
  label = 'condition',
): Promise<NonNullable<T>> {
  const start = Date.now();
  for (;;) {
    const value = await predicate();
    if (value) return value;
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 3));
  }
}

/** Waits for a short real-time gap (lets cross-instance messages drain). */
export function settle(ms = 30): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** A `RoomBackend` wrapper that records every path touched through it. */
export class RecordingBackend implements RoomBackend {
  readonly subscribed: string[] = [];
  readonly reads: string[] = [];
  readonly updates: Array<Record<string, unknown>> = [];
  readonly removed: string[] = [];
  readonly disconnects: Array<{ path: string; value: unknown }> = [];

  constructor(readonly inner: RoomBackend) {}

  /** Every path this client read or subscribed to. */
  get observedPaths(): string[] {
    return [...this.subscribed, ...this.reads];
  }

  signIn(): Promise<string> {
    return this.inner.signIn();
  }

  claimRoom(code: string, meta: Readonly<Record<string, unknown>>): Promise<boolean> {
    return this.inner.claimRoom(code, meta);
  }

  read(path: string): Promise<unknown> {
    this.reads.push(path);
    return this.inner.read(path);
  }

  subscribe(path: string, onValue: (value: unknown) => void, onError?: (error: Error) => void): Unsubscribe {
    this.subscribed.push(path);
    return this.inner.subscribe(path, onValue, onError);
  }

  update(writes: Readonly<Record<string, unknown>>): Promise<void> {
    this.updates.push({ ...writes });
    return this.inner.update(writes);
  }

  remove(path: string): Promise<void> {
    this.removed.push(path);
    return this.inner.remove(path);
  }

  onDisconnect(path: string, value: unknown): Promise<DisconnectHandle> {
    this.disconnects.push({ path, value });
    return this.inner.onDisconnect(path, value);
  }
}
