/**
 * The room service every screen uses: a live, role-aware view of one room plus
 * `dispatch(action)`, which runs the rules core and writes the result.
 *
 * - **Least privilege.** Until `meta` says this client is the host, it listens
 *   only to `meta`, `deck`, `players`, `sheriff`, its own `cards/{myId}` and its
 *   own `events/{myId}`. Only the host listens to `cards`, `spares`, `night`
 *   and `events` as a whole. When `meta.hostId` changes (handover), the
 *   listeners are swapped and the host-only data is dropped from the old
 *   host's view.
 * - **One write per action.** `dispatch` applies the action to the current view
 *   with `applyAction`, diffs old and new state onto the layout and sends only
 *   the changed paths as one multi-path `update` (so deal and reveal are atomic).
 *   A player's actions may only change `players/{myId}`.
 * - **Untrusted data.** Backend values are parsed defensively (`roomData.ts`);
 *   malformed data never throws, it just reads as missing.
 * - **Presence.** While this client has a player record, it keeps an
 *   `onDisconnect(players/{myId}/connected, false)` queued and sets `connected`
 *   back to true whenever it reads false.
 */
import {
  applyAction,
  getOwn,
  isSafeId,
  type Action,
  type GameErrorCode,
  type PlayerId,
  type RoomState,
} from '@/game';
import { buildRoomState, diffRoomState, parseMeta, type RawRoom } from './roomData';
import type { DisconnectHandle, RoomBackend, Unsubscribe } from './RoomBackend';
import { ROOM_CODE_PATTERN } from './roomCode';
import { isWithin, playerEntryPath, playerFieldPath, roomRoot, sectionPath } from './paths';

/** An action without `actorId`: the room service always sends it as `myId`. */
export type RoomAction = DistributiveOmit<Action, 'actorId'>;

/** `Omit` applied to each member of a union separately. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** Why a dispatch failed: a rules error, or one of the room service's own codes. */
export type RoomErrorCode = GameErrorCode | 'room-missing' | 'forbidden-write' | 'write-failed' | 'closed';

/** A failed dispatch. */
export interface RoomError {
  readonly code: RoomErrorCode;
  readonly message: string;
}

/** Result of `dispatch`: the new state (as this client computed it) or an error. Never throws. */
export type DispatchResult = { readonly ok: true; readonly state: RoomState } | { readonly ok: false; readonly error: RoomError };

/** What this client currently knows about the room. A new object on every change. */
export interface RoomView {
  readonly code: string;
  readonly myId: PlayerId;
  /** True once every path this client listens to has delivered a value. */
  readonly loaded: boolean;
  /** True when `meta` exists and is valid. */
  readonly exists: boolean;
  /** True when `meta.hostId === myId`. */
  readonly isHost: boolean;
  /**
   * The room as this client may see it, or null when it does not exist. For a
   * player, `cards` and `events` hold only its own entry, and `night` and
   * `spares` are always empty.
   */
  readonly state: RoomState | null;
}

/** A live connection to one room. */
export interface Room {
  readonly code: string;
  readonly myId: PlayerId;
  /** The current view (stable object until the next change; fits `useSyncExternalStore`). */
  getView(): RoomView;
  /** Calls `listener` after every view change. Returns an unsubscribe function. */
  subscribe(listener: (view: RoomView) => void): () => void;
  /** Resolves with the view once it is loaded (or when the room is closed). */
  whenLoaded(): Promise<RoomView>;
  /**
   * Applies `action` as `myId` and writes the changed paths in one update.
   * Dispatches run one at a time, in call order. On a rules error nothing is written.
   */
  dispatch(action: RoomAction): Promise<DispatchResult>;
  /** Host only: deletes the whole room (End session). */
  deleteRoom(): Promise<DispatchResult>;
  /** Stops listening. The presence onDisconnect stays queued (the phone is still in the room). */
  close(): void;
}

/** Options for `openRoom`, injectable for tests. */
export interface OpenRoomOptions {
  /** Random numbers in [0, 1) for dealing. Default: `crypto.getRandomValues`. */
  readonly rng?: () => number;
  /** Clock (ms since the epoch) for reveal events. Default `Date.now`. */
  readonly now?: () => number;
  /** Keep `connected` up to date with onDisconnect. Default true. */
  readonly presence?: boolean;
}

/** A uniform number in [0, 1) from the CSPRNG. */
export function cryptoRng(): number {
  const words = globalThis.crypto.getRandomValues(new Uint32Array(2));
  // 53 random bits → exactly representable double in [0, 1).
  return (words[0] * 2 ** 21 + (words[1] >>> 11)) / 2 ** 53;
}

type SourceKey = 'meta' | 'deck' | 'players' | 'sheriff' | 'cards' | 'spares' | 'night' | 'events' | 'myCard' | 'myEvent';

function fail(code: RoomErrorCode, message: string): DispatchResult {
  return { ok: false, error: { code, message } };
}

/**
 * Opens room `code` for guest `myId` on `backend`.
 *
 * @throws Error synchronously when `code` does not match `ROOM_CODE_PATTERN` or
 *   `myId` is not a safe id.
 */
export function openRoom(backend: RoomBackend, code: string, myId: PlayerId, opts: OpenRoomOptions = {}): Room {
  if (typeof code !== 'string' || !ROOM_CODE_PATTERN.test(code)) throw new Error(`"${String(code)}" is not a valid room code.`);
  if (!isSafeId(myId)) throw new Error('myId must be a safe id.');
  const rng = opts.rng ?? cryptoRng;
  const now = opts.now ?? Date.now;
  const presenceOn = opts.presence ?? true;

  const raw = new Map<SourceKey, unknown>();
  const delivered = new Set<SourceKey>();
  const listeners = new Map<SourceKey, { unsubscribe: Unsubscribe | null }>();
  const viewListeners = new Set<(view: RoomView) => void>();
  const loadWaiters: Array<(view: RoomView) => void> = [];
  let isHost = false;
  let closed = false;
  let view: RoomView = { code, myId, loaded: false, exists: false, isHost: false, state: null };
  let queue: Promise<unknown> = Promise.resolve();
  let presence: Promise<DisconnectHandle | null> | null = null;
  let asserting = false;

  function wantedSources(host: boolean): Map<SourceKey, string> {
    const m = new Map<SourceKey, string>([
      ['meta', sectionPath(code, 'meta')],
      ['deck', sectionPath(code, 'deck')],
      ['players', sectionPath(code, 'players')],
      ['sheriff', sectionPath(code, 'sheriff')],
    ]);
    if (host) {
      m.set('cards', sectionPath(code, 'cards'));
      m.set('spares', sectionPath(code, 'spares'));
      m.set('night', sectionPath(code, 'night'));
      m.set('events', sectionPath(code, 'events'));
    } else {
      m.set('myCard', playerEntryPath(code, 'cards', myId));
      m.set('myEvent', playerEntryPath(code, 'events', myId));
    }
    return m;
  }

  function syncListeners(): void {
    const wanted = wantedSources(isHost);
    for (const [key, entry] of [...listeners]) {
      if (wanted.has(key)) continue;
      listeners.delete(key);
      entry.unsubscribe?.();
      raw.delete(key);
      delivered.delete(key);
    }
    for (const [key, path] of wanted) {
      if (listeners.has(key)) continue;
      const entry: { unsubscribe: Unsubscribe | null } = { unsubscribe: null };
      listeners.set(key, entry); // before subscribing: the callback may fire synchronously
      const unsubscribe = backend.subscribe(
        path,
        (value) => {
          if (!closed && listeners.get(key) === entry) onValue(key, value);
        },
        () => {
          // Permission denied or similar: treat as missing data, but loaded.
          if (!closed && listeners.get(key) === entry) onValue(key, null);
        },
      );
      if (listeners.get(key) === entry) entry.unsubscribe = unsubscribe;
      else unsubscribe();
    }
  }

  function onValue(key: SourceKey, value: unknown): void {
    raw.set(key, value);
    delivered.add(key);
    if (key === 'meta') {
      const nowHost = parseMeta(value)?.hostId === myId;
      if (nowHost !== isHost) {
        isHost = nowHost;
        syncListeners();
      }
    }
    refresh();
  }

  function rebuildState(): RoomState | null {
    const cards = raw.get('myCard');
    const event = raw.get('myEvent');
    const input: RawRoom = isHost
      ? {
          meta: raw.get('meta'),
          deck: raw.get('deck'),
          players: raw.get('players'),
          cards: raw.get('cards'),
          spares: raw.get('spares'),
          sheriff: raw.get('sheriff'),
          night: raw.get('night'),
          events: raw.get('events'),
        }
      : {
          meta: raw.get('meta'),
          deck: raw.get('deck'),
          players: raw.get('players'),
          cards: cards == null ? null : { [myId]: cards },
          sheriff: raw.get('sheriff'),
          events: event == null ? null : { [myId]: event },
        };
    return buildRoomState(input);
  }

  function refresh(): void {
    const state = rebuildState();
    const loaded = [...listeners.keys()].every((k) => delivered.has(k));
    view = { code, myId, loaded, exists: state !== null, isHost: isHost && state !== null, state };
    if (loaded) for (const resolve of loadWaiters.splice(0)) resolve(view);
    for (const listener of [...viewListeners]) {
      try {
        listener(view);
      } catch (error) {
        console.error('Room listener threw:', error);
      }
    }
    checkPresence();
  }

  function checkPresence(): void {
    if (!presenceOn || closed || !view.loaded || !view.state) return;
    const me = getOwn(view.state.players, myId);
    if (me && presence === null) {
      presence = backend.onDisconnect(playerFieldPath(code, myId, 'connected'), false).catch(() => null);
    }
    if (me && !me.connected && !asserting && presence !== null) {
      asserting = true;
      void presence
        .then(() => dispatch({ type: 'setConnected', connected: true }))
        .finally(() => {
          asserting = false;
        });
    }
    if (!me && presence !== null && !asserting) {
      const handle = presence;
      presence = null;
      void handle.then((h) => h?.cancel()).catch(() => undefined);
    }
  }

  function whenLoaded(): Promise<RoomView> {
    if (view.loaded || closed) return Promise.resolve(view);
    return new Promise((resolve) => loadWaiters.push(resolve));
  }

  async function runDispatch(input: RoomAction): Promise<DispatchResult> {
    if (closed) return fail('closed', 'The room is closed.');
    const current = await whenLoaded();
    if (closed) return fail('closed', 'The room is closed.');
    if (!current.state) return fail('room-missing', 'This game does not exist.');
    const action = { ...(input as object), actorId: myId } as Action;
    const result = applyAction(current.state, action, { rng, now });
    if (!result.ok) return result;
    const writes = diffRoomState(code, current.state, result.state);
    if (!current.isHost) {
      const mine = playerEntryPath(code, 'players', myId);
      const outside = Object.keys(writes).find((p) => !isWithin(p, mine));
      if (outside !== undefined) return fail('forbidden-write', 'A player can only change their own record.');
    }
    if (Object.keys(writes).length > 0) {
      try {
        await backend.update(writes);
      } catch (error) {
        return fail('write-failed', error instanceof Error ? error.message : 'The write failed.');
      }
    }
    return { ok: true, state: result.state };
  }

  function dispatch(action: RoomAction): Promise<DispatchResult> {
    const run = queue.then(() => runDispatch(action));
    queue = run.catch(() => undefined);
    return run;
  }

  async function deleteRoom(): Promise<DispatchResult> {
    const current = await whenLoaded();
    if (closed) return fail('closed', 'The room is closed.');
    if (!current.state) return fail('room-missing', 'This game does not exist.');
    if (!current.isHost) return fail('not-host', 'Only the host can end the session.');
    try {
      await backend.remove(roomRoot(code));
    } catch (error) {
      return fail('write-failed', error instanceof Error ? error.message : 'The write failed.');
    }
    return { ok: true, state: current.state };
  }

  syncListeners();

  return {
    code,
    myId,
    getView: () => view,
    subscribe(listener) {
      viewListeners.add(listener);
      return () => {
        viewListeners.delete(listener);
      };
    },
    whenLoaded,
    dispatch,
    deleteRoom,
    close() {
      if (closed) return;
      closed = true;
      for (const entry of listeners.values()) entry.unsubscribe?.();
      listeners.clear();
      viewListeners.clear();
      for (const resolve of loadWaiters.splice(0)) resolve(view);
    },
  };
}
