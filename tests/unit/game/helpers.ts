import {
  applyAction,
  newRoomState,
  type Action,
  type ActionContext,
  type HostMode,
  type RoomState,
  type SpecialRoleId,
  type StateResult,
} from '@/game';

/** Tiny seeded PRNG (mulberry32). Returns numbers in [0, 1). Test-only. */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fixed clock value used by tests. */
export const FIXED_NOW = 1_700_000_000_000;
export const CREATED_AT = 1_600_000_000_000;
export const HOST = 'host';

/** A deterministic context: seeded rng and a fixed clock. */
export function ctx(seed = 42, now = FIXED_NOW): ActionContext {
  return { rng: seededRng(seed), now: () => now };
}

/** Unwraps a successful result or fails the test with the error. */
export function must(result: StateResult): RoomState {
  if (!result.ok) throw new Error(`expected ok, got ${result.error.code}: ${result.error.message}`);
  return result.state;
}

/** Applies an action and unwraps it. */
export function step(state: RoomState, action: Action, c: ActionContext = ctx()): RoomState {
  return must(applyAction(state, action, c));
}

/** Casts arbitrary data to Action, for feeding the reducer garbage. */
export function raw(value: unknown): Action {
  return value as Action;
}

/** Player ids p01, p02, ... */
export function playerIds(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `p${String(i + 1).padStart(2, '0')}`);
}

export function freshRoom(): RoomState {
  return must(newRoomState(HOST, CREATED_AT));
}

export interface LobbyOptions {
  players: number;
  playerCount?: number;
  specialRoles?: SpecialRoleId[];
  sheriffOn?: boolean;
  hostMode?: HostMode;
  /** Also give the host a player record (name "Host"). */
  hostJoins?: boolean;
  ready?: boolean;
}

/** A lobby with `players` joined (non-host) players, optionally all Ready. */
export function lobby(opts: LobbyOptions): RoomState {
  let s = freshRoom();
  s = step(s, {
    type: 'configureDeck',
    actorId: HOST,
    playerCount: opts.playerCount ?? opts.players,
    specialRoles: opts.specialRoles ?? [],
    sheriffOn: opts.sheriffOn ?? true,
  });
  if (opts.hostMode) s = step(s, { type: 'setHostMode', actorId: HOST, hostMode: opts.hostMode });
  if (opts.hostJoins) s = step(s, { type: 'join', actorId: HOST, name: 'Host' });
  for (const id of playerIds(opts.players)) {
    s = step(s, { type: 'join', actorId: id, name: `Name ${id}` });
    if (opts.ready ?? true) s = step(s, { type: 'setReady', actorId: id, ready: true });
  }
  return s;
}

/** A dealt game with `players` moderated players. */
export function dealtGame(opts: LobbyOptions, seed = 7): RoomState {
  return step(lobby(opts), { type: 'deal', actorId: HOST }, ctx(seed));
}

/** Recursively freezes a value so any mutation throws in strict mode. */
export function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}
