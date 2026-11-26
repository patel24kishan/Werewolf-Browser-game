/**
 * The room reducer: `applyAction(state, action, ctx)` → new state or an error.
 *
 * Implements the flow in `design/companion-flow.md` and the data layout in
 * `design/companion-architecture.md`. It never throws for bad input and never
 * mutates its arguments. Actions may come from the network, so every payload is
 * validated at runtime.
 *
 * State machine (status transitions):
 *
 * | From          | Action          | To      |
 * |---------------|-----------------|---------|
 * | lobby         | deal            | dealt   |
 * | dealt, day    | startNight      | night   |
 * | night(locked) | reveal          | day     |
 * | dealt/night/day | endGame       | over    |
 * | over          | chooseNextHost  | lobby   |
 *
 * Every other action leaves `meta.status` unchanged.
 */
import { buildDeck, deal as dealCards, normalizeSpecialRoles } from './deck';
import { fail } from './errors';
import { getOwn, getOwnRecord, hasOwn, isPlainObject, isSafeId, safeKeys } from './ids';
import { isNameTaken, normalizeName } from './names';
import { MAX_PLAYERS } from './rules';
import { checkStartRule, countedPlayerIds, emptyNight } from './state';
import type {
  Action,
  ActionContext,
  ActionType,
  AttackEvent,
  CardRecord,
  Failure,
  PlayerId,
  PlayerRecord,
  RoomState,
  RoomStatus,
  StateResult,
} from './types';

// ---------------------------------------------------------------------------
// Payload validation
// ---------------------------------------------------------------------------

type FieldCheck = (value: unknown) => boolean;

const isString: FieldCheck = (v) => typeof v === 'string';
const isBoolean: FieldCheck = (v) => typeof v === 'boolean';
const isNumber: FieldCheck = (v) => typeof v === 'number';
const isArray: FieldCheck = (v) => Array.isArray(v);
const isHostMode: FieldCheck = (v) => v === 'moderating' || v === 'playing';

/** Allowed payload fields (besides `type` and `actorId`) for each action type. */
const ACTION_FIELDS: Readonly<Record<ActionType, Readonly<Record<string, FieldCheck>>>> = {
  join: { name: isString },
  setName: { name: isString },
  setReady: { ready: isBoolean },
  setConnected: { connected: isBoolean },
  removePlayer: { playerId: isSafeId },
  setHostMode: { hostMode: isHostMode },
  configureDeck: { playerCount: isNumber, specialRoles: isArray, sheriffOn: isBoolean },
  deal: {},
  assignSheriff: { playerId: isSafeId },
  skipSheriff: {},
  startNight: {},
  toggleKilled: { playerId: isSafeId },
  confirmKills: {},
  undoConfirm: {},
  reveal: {},
  endGame: {},
  chooseNextHost: { newHostId: isSafeId },
};

/**
 * Validates untrusted data as an `Action`: a plain object with a known `type`,
 * a safe `actorId`, exactly the fields that type needs, each of the right kind.
 * Extra fields are rejected.
 */
export function parseAction(raw: unknown): { ok: true; action: Action } | Failure {
  if (!isPlainObject(raw)) return fail('invalid-action', 'An action must be an object.');
  const type = raw.type;
  if (typeof type !== 'string' || !hasOwn(ACTION_FIELDS, type)) {
    return fail('unknown-action', `Unknown action type "${String(type)}".`);
  }
  if (!isSafeId(raw.actorId)) return fail('invalid-id', 'actorId must be a safe id.');
  const fields = ACTION_FIELDS[type as ActionType];
  for (const key of Object.keys(raw)) {
    if (key !== 'type' && key !== 'actorId' && !hasOwn(fields, key)) {
      return fail('invalid-action', `Unexpected field "${key}" on ${type}.`);
    }
  }
  for (const key of Object.keys(fields)) {
    if (!hasOwn(raw, key) || !fields[key](raw[key])) {
      const code = key === 'playerId' || key === 'newHostId' ? 'invalid-id' : 'invalid-action';
      return fail(code, `Field "${key}" on ${type} is missing or invalid.`);
    }
  }
  return { ok: true, action: raw as unknown as Action };
}

const STATUSES: readonly RoomStatus[] = ['lobby', 'dealt', 'night', 'day', 'over'];

/** Shallow structural check of a state read from storage or the network. */
function isRoomStateShape(state: unknown): state is RoomState {
  if (!isPlainObject(state)) return false;
  const { meta, deck, players, cards, spares, sheriff, night, events } = state;
  return (
    isPlainObject(meta) &&
    isSafeId(meta.hostId) &&
    isHostMode(meta.hostMode) &&
    (STATUSES as readonly unknown[]).includes(meta.status) &&
    typeof meta.sheriffOn === 'boolean' &&
    isPlainObject(deck) &&
    typeof deck.playerCount === 'number' &&
    Array.isArray(deck.specialRoles) &&
    isPlainObject(players) &&
    isPlainObject(cards) &&
    Array.isArray(spares) &&
    (sheriff === null || isSafeId(sheriff)) &&
    isPlainObject(night) &&
    isPlainObject(night.killed) &&
    typeof night.locked === 'boolean' &&
    isPlainObject(events)
  );
}

// ---------------------------------------------------------------------------
// Small immutable helpers
// ---------------------------------------------------------------------------

function ok(state: RoomState): StateResult {
  return { ok: true, state };
}

function requireHost(state: RoomState, action: Action): Failure | null {
  return action.actorId === state.meta.hostId
    ? null
    : fail('not-host', `Only the host can ${action.type}.`);
}

function requireStatus(state: RoomState, action: Action, allowed: readonly RoomStatus[]): Failure | null {
  return allowed.includes(state.meta.status)
    ? null
    : fail('wrong-status', `${action.type} is not allowed while the room is "${state.meta.status}".`);
}

function withPlayer(state: RoomState, id: PlayerId, record: PlayerRecord): RoomState {
  return { ...state, players: { ...state.players, [id]: record } };
}

function withStatus(state: RoomState, status: RoomStatus): RoomState {
  return { ...state, meta: { ...state.meta, status } };
}

/** Copies the safe-keyed entries of `record`, applying `map` to each value. */
function mapRecord<T, U>(record: Readonly<Record<string, T>>, map: (value: T, id: string) => U): Record<string, U> {
  const out: Record<string, U> = {};
  for (const id of safeKeys(record)) {
    const value = getOwn(record, id);
    if (value !== undefined) out[id] = map(value, id);
  }
  return out;
}

/** A living player who was dealt a card this game. */
function checkLivingInGame(state: RoomState, id: PlayerId): Failure | null {
  const record = getOwnRecord(state.players, id);
  if (record === undefined || !hasOwn(state.cards, id)) {
    return fail('not-in-game', `Player "${id}" is not in this game.`);
  }
  if (record.alive !== true) return fail('player-dead', `Player "${id}" is dead.`);
  return null;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

type Handler<A extends Action> = (state: RoomState, action: A, ctx: ActionContext) => StateResult;
type HandlerMap = { [K in ActionType]: Handler<Extract<Action, { type: K }>> };

const GAME_STATUSES: readonly RoomStatus[] = ['dealt', 'night', 'day'];

const HANDLERS: HandlerMap = {
  join(state, action) {
    const bad = requireStatus(state, action, ['lobby']);
    if (bad) return bad;
    if (hasOwn(state.players, action.actorId)) {
      return fail('already-joined', 'You are already in this room.');
    }
    // Room for MAX_PLAYERS players plus a moderating host with a record.
    if (safeKeys(state.players).length >= MAX_PLAYERS + 1) {
      return fail('room-full', 'This room is full.');
    }
    const name = normalizeName(action.name);
    if (!name.ok) return name;
    if (isNameTaken(state.players, name.name, null)) {
      return fail('name-taken', `The name "${name.name}" is already taken.`);
    }
    return ok(
      withPlayer(state, action.actorId, { name: name.name, ready: false, connected: true, alive: true }),
    );
  },

  setName(state, action) {
    const bad = requireStatus(state, action, ['lobby']);
    if (bad) return bad;
    const record = getOwnRecord(state.players, action.actorId);
    if (record === undefined) return fail('unknown-player', 'You have not joined this room.');
    const name = normalizeName(action.name);
    if (!name.ok) return name;
    if (isNameTaken(state.players, name.name, action.actorId)) {
      return fail('name-taken', `The name "${name.name}" is already taken.`);
    }
    return ok(withPlayer(state, action.actorId, { ...record, name: name.name }));
  },

  setReady(state, action) {
    const bad = requireStatus(state, action, ['lobby']);
    if (bad) return bad;
    const record = getOwnRecord(state.players, action.actorId);
    if (record === undefined) return fail('unknown-player', 'You have not joined this room.');
    return ok(withPlayer(state, action.actorId, { ...record, ready: action.ready }));
  },

  setConnected(state, action) {
    const record = getOwnRecord(state.players, action.actorId);
    if (record === undefined) return fail('unknown-player', 'You have not joined this room.');
    return ok(withPlayer(state, action.actorId, { ...record, connected: action.connected }));
  },

  removePlayer(state, action) {
    const bad = requireHost(state, action) ?? requireStatus(state, action, ['lobby']);
    if (bad) return bad;
    if (!hasOwn(state.players, action.playerId)) {
      return fail('unknown-player', `Player "${action.playerId}" is not in this room.`);
    }
    const players = mapRecord(state.players, (p) => p);
    delete players[action.playerId];
    return ok({ ...state, players });
  },

  setHostMode(state, action) {
    const bad = requireHost(state, action) ?? requireStatus(state, action, ['lobby']);
    if (bad) return bad;
    return ok({ ...state, meta: { ...state.meta, hostMode: action.hostMode } });
  },

  configureDeck(state, action) {
    const bad = requireHost(state, action) ?? requireStatus(state, action, ['lobby']);
    if (bad) return bad;
    const specials = normalizeSpecialRoles(action.specialRoles);
    if (!specials.ok) return specials;
    const built = buildDeck(action.playerCount, specials.roles);
    if (!built.ok) return built;
    return ok({
      ...state,
      meta: { ...state.meta, sheriffOn: action.sheriffOn },
      deck: { playerCount: action.playerCount, specialRoles: specials.roles },
    });
  },

  deal(state, action, ctx) {
    const bad = requireHost(state, action) ?? requireStatus(state, action, ['lobby']);
    if (bad) return bad;
    const start = checkStartRule(state);
    if (!start.ok) {
      return fail(
        'start-rule-failed',
        `Need ${start.required} players, all Ready (have ${start.joined}, ${start.notReady.length} not Ready` +
          `${start.hostNeedsName ? ', host has no name' : ''}).`,
      );
    }
    const built = buildDeck(state.deck.playerCount, state.deck.specialRoles);
    if (!built.ok) return built;
    const dealt = dealCards(countedPlayerIds(state), built.deck, ctx.rng);
    if (!dealt.ok) return dealt;
    const cards: Record<PlayerId, CardRecord> = mapRecord(dealt.cards, (role) => ({ role }));
    return ok({
      ...state,
      meta: { ...state.meta, status: 'dealt' },
      players: mapRecord(state.players, (p) => ({ ...p, alive: true })),
      cards,
      spares: dealt.spares,
      sheriff: null,
      night: emptyNight(),
      events: {},
    });
  },

  assignSheriff(state, action) {
    const bad = requireHost(state, action) ?? requireStatus(state, action, GAME_STATUSES);
    if (bad) return bad;
    if (!state.meta.sheriffOn) return fail('sheriff-off', 'The Sheriff is switched off for this game.');
    const target = checkLivingInGame(state, action.playerId);
    if (target) return target;
    return ok({ ...state, sheriff: action.playerId });
  },

  skipSheriff(state, action) {
    const bad = requireHost(state, action) ?? requireStatus(state, action, GAME_STATUSES);
    if (bad) return bad;
    if (!state.meta.sheriffOn) return fail('sheriff-off', 'The Sheriff is switched off for this game.');
    return ok({ ...state, sheriff: null });
  },

  startNight(state, action) {
    const bad = requireHost(state, action) ?? requireStatus(state, action, ['dealt', 'day']);
    if (bad) return bad;
    return ok({ ...withStatus(state, 'night'), night: emptyNight() });
  },

  toggleKilled(state, action) {
    const bad = requireHost(state, action) ?? requireStatus(state, action, ['night']);
    if (bad) return bad;
    if (state.night.locked) return fail('night-locked', 'Kills are confirmed; undo first.');
    const target = checkLivingInGame(state, action.playerId);
    if (target) return target;
    const killed = mapRecord(state.night.killed, () => true as const);
    if (hasOwn(killed, action.playerId)) delete killed[action.playerId];
    else killed[action.playerId] = true;
    return ok({ ...state, night: { ...state.night, killed } });
  },

  confirmKills(state, action) {
    const bad = requireHost(state, action) ?? requireStatus(state, action, ['night']);
    if (bad) return bad;
    if (state.night.locked) return fail('night-locked', 'Kills are already confirmed.');
    return ok({ ...state, night: { ...state.night, locked: true } });
  },

  undoConfirm(state, action) {
    const bad = requireHost(state, action) ?? requireStatus(state, action, ['night']);
    if (bad) return bad;
    if (!state.night.locked) return fail('night-not-locked', 'Kills have not been confirmed.');
    return ok({ ...state, night: { ...state.night, locked: false } });
  },

  reveal(state, action, ctx) {
    const bad = requireHost(state, action) ?? requireStatus(state, action, ['night']);
    if (bad) return bad;
    if (!state.night.locked) return fail('night-not-locked', 'Confirm the kills before revealing.');
    const now = ctx.now();
    if (typeof now !== 'number' || !Number.isFinite(now)) {
      return fail('invalid-context', 'ctx.now() must return a finite number.');
    }
    const players: Record<PlayerId, PlayerRecord> = mapRecord(state.players, (p) => p);
    const events: Record<PlayerId, AttackEvent> = mapRecord(state.events, (e) => e);
    for (const id of safeKeys(state.night.killed)) {
      const record = getOwnRecord(state.players, id);
      if (record === undefined || record.alive !== true) continue;
      players[id] = { ...record, alive: false };
      events[id] = { killedAt: now };
    }
    return ok({ ...withStatus(state, 'day'), players, events });
  },

  endGame(state, action) {
    const bad = requireHost(state, action) ?? requireStatus(state, action, GAME_STATUSES);
    if (bad) return bad;
    return ok(withStatus(state, 'over'));
  },

  chooseNextHost(state, action) {
    const bad = requireHost(state, action) ?? requireStatus(state, action, ['over']);
    if (bad) return bad;
    const newHostId = action.newHostId;
    if (newHostId !== state.meta.hostId && !hasOwn(state.players, newHostId)) {
      return fail('unknown-player', `Player "${newHostId}" is not in this room.`);
    }
    return ok({
      ...state,
      meta: { ...state.meta, hostId: newHostId, status: 'lobby' },
      players: mapRecord(state.players, (p) => ({ ...p, ready: false, alive: true })),
      cards: {},
      spares: [],
      sheriff: null,
      night: emptyNight(),
      events: {},
    });
  },
};

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Applies one action to the room state.
 *
 * - Returns `{ ok: true, state }` with a new state, or `{ ok: false, error }`.
 *   Never throws for bad input and never mutates `state` or `action`.
 * - `action` is validated at runtime (it may have come over the network); unknown
 *   types, unsafe ids and malformed or extra fields are rejected.
 * - Host-only actions are rejected unless `actorId === state.meta.hostId`.
 *   Player actions (`join`, `setName`, `setReady`, `setConnected`) only touch the
 *   actor's own record.
 * - `ctx.rng` is used by `deal`, `ctx.now` by `reveal`.
 */
export function applyAction(state: RoomState, action: Action, ctx: ActionContext): StateResult {
  try {
    if (!isRoomStateShape(state)) return fail('invalid-state', 'The room state is malformed.');
    if (!isPlainObject(ctx) || typeof ctx.rng !== 'function' || typeof ctx.now !== 'function') {
      return fail('invalid-context', 'ctx must provide rng() and now().');
    }
    const parsed = parseAction(action);
    if (!parsed.ok) return parsed;
    const handler = HANDLERS[parsed.action.type] as Handler<Action>;
    return handler(state, parsed.action, ctx);
  } catch {
    // Defensive: a malformed nested record (e.g. a player that is not an object)
    // must still produce an error result rather than an exception.
    return fail('invalid-state', 'The action could not be applied to this state.');
  }
}
