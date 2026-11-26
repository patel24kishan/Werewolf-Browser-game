/**
 * Mapping between `RoomState` (the rules core's view of a room) and the database
 * layout under `rooms/{code}/`.
 *
 * - `parse*` / `buildRoomState`: turn untrusted backend data into a `RoomState`.
 *   They never throw, read only own properties, keep only safe-id keys and known
 *   fields, and fall back to defaults for anything malformed.
 * - `diffRoomState`: the minimal multi-path update that turns one state into
 *   another (only changed paths; deletions as `null`). Paths never overlap, so
 *   the result is a valid single `RoomBackend.update`.
 */
import {
  DEFAULT_PLAYER_COUNT,
  DEFAULT_SHERIFF_ON,
  compareOrdinal,
  emptyNight,
  getCardMix,
  getOwn,
  hasOwn,
  isDealtRoleId,
  isSafeId,
  isSpecialRoleId,
  normalizeName,
  normalizeSpecialRoles,
  type AttackEvent,
  type CardRecord,
  type DealtRoleId,
  type DeckConfig,
  type HostMode,
  type NightState,
  type PlayerId,
  type PlayerRecord,
  type RoomMeta,
  type RoomState,
  type RoomStatus,
  type SpecialRoleId,
} from '@/game';
import {
  META_FIELDS,
  PLAYER_FIELDS,
  metaFieldPath,
  nightKilledPath,
  nightLockedPath,
  playerEntryPath,
  playerFieldPath,
  sectionPath,
} from './paths';

const STATUSES: readonly RoomStatus[] = ['lobby', 'dealt', 'night', 'day', 'over'];

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Own, safe-id keys of `value` in ordinal order (none for non-objects). */
function safeOwnKeys(value: unknown): string[] {
  const obj = asObject(value);
  return obj ? Object.keys(obj).filter(isSafeId).sort(compareOrdinal) : [];
}

function own(obj: Record<string, unknown>, key: string): unknown {
  return hasOwn(obj, key) ? obj[key] : undefined;
}

/**
 * Items of a stored list. Accepts an array, or the `{ "0": …, "1": … }` object
 * Firebase may return for an array; anything else is an empty list.
 */
function listItems(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.slice();
  const obj = asObject(value);
  if (!obj) return [];
  return Object.keys(obj)
    .filter((k) => /^(0|[1-9][0-9]{0,3})$/.test(k))
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => obj[k]);
}

// ---------------------------------------------------------------------------
// Parsing (backend → RoomState)
// ---------------------------------------------------------------------------

/** `meta`, or null when missing or unusable (no valid hostId or status). */
export function parseMeta(raw: unknown): RoomMeta | null {
  const obj = asObject(raw);
  if (!obj) return null;
  const hostId = own(obj, 'hostId');
  const status = own(obj, 'status');
  if (!isSafeId(hostId) || !(STATUSES as readonly unknown[]).includes(status)) return null;
  const hostMode = own(obj, 'hostMode');
  const sheriffOn = own(obj, 'sheriffOn');
  const createdAt = own(obj, 'createdAt');
  return {
    hostId,
    hostMode: hostMode === 'playing' || hostMode === 'moderating' ? (hostMode as HostMode) : 'moderating',
    status: status as RoomStatus,
    sheriffOn: typeof sheriffOn === 'boolean' ? sheriffOn : DEFAULT_SHERIFF_ON,
    createdAt: typeof createdAt === 'number' && Number.isFinite(createdAt) ? createdAt : 0,
  };
}

/** `deck`; an unsupported player count falls back to the default, unknown roles are dropped. */
export function parseDeck(raw: unknown): DeckConfig {
  const obj = asObject(raw);
  const count = obj ? own(obj, 'playerCount') : undefined;
  const playerCount = typeof count === 'number' && getCardMix(count) !== undefined ? count : DEFAULT_PLAYER_COUNT;
  const chosen: SpecialRoleId[] = [];
  for (const item of listItems(obj ? own(obj, 'specialRoles') : undefined)) {
    if (isSpecialRoleId(item) && !chosen.includes(item)) chosen.push(item);
  }
  const specials = normalizeSpecialRoles(chosen);
  return { playerCount, specialRoles: specials.ok ? specials.roles : [] };
}

/** One `players/{id}` record, or null when it has no valid name. */
export function parsePlayer(raw: unknown): PlayerRecord | null {
  const obj = asObject(raw);
  if (!obj) return null;
  const name = normalizeName(own(obj, 'name'));
  if (!name.ok) return null;
  const ready = own(obj, 'ready');
  const connected = own(obj, 'connected');
  const alive = own(obj, 'alive');
  return {
    name: name.name,
    ready: ready === true,
    connected: connected === true,
    alive: typeof alive === 'boolean' ? alive : true,
  };
}

/** `players`: records with a safe id and a valid name. */
export function parsePlayers(raw: unknown): Record<PlayerId, PlayerRecord> {
  const out: Record<PlayerId, PlayerRecord> = {};
  const obj = asObject(raw);
  for (const id of safeOwnKeys(raw)) {
    const record = parsePlayer(obj![id]);
    if (record) out[id] = record;
  }
  return out;
}

/** One `cards/{id}`, or null unless it is `{ role: <dealt role> }`. */
export function parseCard(raw: unknown): CardRecord | null {
  const obj = asObject(raw);
  const role = obj ? own(obj, 'role') : undefined;
  return isDealtRoleId(role) ? { role } : null;
}

/** `cards`: entries with a safe id and a dealt role. */
export function parseCards(raw: unknown): Record<PlayerId, CardRecord> {
  const out: Record<PlayerId, CardRecord> = {};
  const obj = asObject(raw);
  for (const id of safeOwnKeys(raw)) {
    const card = parseCard(obj![id]);
    if (card) out[id] = card;
  }
  return out;
}

/** `spares`: the dealt roles in the list, in order. */
export function parseSpares(raw: unknown): DealtRoleId[] {
  return listItems(raw).filter(isDealtRoleId);
}

/** `sheriff`: a safe id or null. */
export function parseSheriff(raw: unknown): PlayerId | null {
  return isSafeId(raw) ? raw : null;
}

/** `night`: killed ids (value `true`, safe keys) and the locked flag. */
export function parseNight(raw: unknown): NightState {
  const obj = asObject(raw);
  if (!obj) return emptyNight();
  const killedRaw = own(obj, 'killed');
  const killedObj = asObject(killedRaw);
  const killed: Record<PlayerId, true> = {};
  for (const id of safeOwnKeys(killedRaw)) if (killedObj![id] === true) killed[id] = true;
  return { killed, locked: own(obj, 'locked') === true };
}

/** One `events/{id}`, or null unless it has a finite `killedAt`. */
export function parseEvent(raw: unknown): AttackEvent | null {
  const obj = asObject(raw);
  const killedAt = obj ? own(obj, 'killedAt') : undefined;
  return typeof killedAt === 'number' && Number.isFinite(killedAt) ? { killedAt } : null;
}

/** `events`: entries with a safe id and a valid event. */
export function parseEvents(raw: unknown): Record<PlayerId, AttackEvent> {
  const out: Record<PlayerId, AttackEvent> = {};
  const obj = asObject(raw);
  for (const id of safeOwnKeys(raw)) {
    const event = parseEvent(obj![id]);
    if (event) out[id] = event;
  }
  return out;
}

/**
 * Raw section values as read from the backend (any of them may be missing or
 * malformed). A player's client fills `cards`/`events` with only its own entry.
 */
export interface RawRoom {
  readonly meta?: unknown;
  readonly deck?: unknown;
  readonly players?: unknown;
  readonly cards?: unknown;
  readonly spares?: unknown;
  readonly sheriff?: unknown;
  readonly night?: unknown;
  readonly events?: unknown;
}

/** Builds a `RoomState` from raw data, or null when `meta` is missing or unusable. Never throws. */
export function buildRoomState(raw: RawRoom): RoomState | null {
  try {
    const meta = parseMeta(raw.meta);
    if (!meta) return null;
    return {
      meta,
      deck: parseDeck(raw.deck),
      players: parsePlayers(raw.players),
      cards: parseCards(raw.cards),
      spares: parseSpares(raw.spares),
      sheriff: parseSheriff(raw.sheriff),
      night: parseNight(raw.night),
      events: parseEvents(raw.events),
    };
  } catch {
    return null; // e.g. a throwing getter on hostile input
  }
}

// ---------------------------------------------------------------------------
// Encoding and diffing (RoomState → backend writes)
// ---------------------------------------------------------------------------

/** The stored form of `meta`. */
export function encodeMeta(meta: RoomMeta): Record<string, unknown> {
  return {
    hostId: meta.hostId,
    hostMode: meta.hostMode,
    status: meta.status,
    sheriffOn: meta.sheriffOn,
    createdAt: meta.createdAt,
  };
}

/** The stored form of `deck`. */
export function encodeDeck(deck: DeckConfig): Record<string, unknown> {
  return { playerCount: deck.playerCount, specialRoles: [...deck.specialRoles] };
}

/** The stored form of `players/{id}`. */
export function encodePlayer(p: PlayerRecord): Record<string, unknown> {
  return { name: p.name, ready: p.ready, connected: p.connected, alive: p.alive };
}

function unionKeys(a: object, b: object): string[] {
  return [...new Set([...safeOwnKeys(a), ...safeOwnKeys(b)])].sort(compareOrdinal);
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * The multi-path update that turns `before` into `after` for room `code`:
 * only changed paths, deletions as `null`, no overlapping paths.
 *
 * Granularity: `meta/{field}`, whole `deck`, `players/{id}/{field}` (whole
 * record when added, `null` when removed), `cards/{id}`, whole `spares`,
 * `sheriff`, `night/locked`, `night/killed/{id}`, `events/{id}`.
 */
export function diffRoomState(code: string, before: RoomState, after: RoomState): Record<string, unknown> {
  const writes: Record<string, unknown> = {};

  for (const field of META_FIELDS) {
    if (before.meta[field] !== after.meta[field]) writes[metaFieldPath(code, field)] = after.meta[field];
  }

  if (
    before.deck.playerCount !== after.deck.playerCount ||
    !sameList(before.deck.specialRoles, after.deck.specialRoles)
  ) {
    writes[sectionPath(code, 'deck')] = encodeDeck(after.deck);
  }

  for (const id of unionKeys(before.players, after.players)) {
    const a = getOwn(before.players, id);
    const b = getOwn(after.players, id);
    if (b === undefined) {
      if (a !== undefined) writes[playerEntryPath(code, 'players', id)] = null;
    } else if (a === undefined) {
      writes[playerEntryPath(code, 'players', id)] = encodePlayer(b);
    } else {
      for (const field of PLAYER_FIELDS) {
        if (a[field] !== b[field]) writes[playerFieldPath(code, id, field)] = b[field];
      }
    }
  }

  for (const id of unionKeys(before.cards, after.cards)) {
    const a = getOwn(before.cards, id);
    const b = getOwn(after.cards, id);
    if (a?.role !== b?.role) writes[playerEntryPath(code, 'cards', id)] = b ? { role: b.role } : null;
  }

  if (!sameList(before.spares, after.spares)) {
    writes[sectionPath(code, 'spares')] = after.spares.length > 0 ? [...after.spares] : null;
  }

  if (before.sheriff !== after.sheriff) writes[sectionPath(code, 'sheriff')] = after.sheriff;

  if (before.night.locked !== after.night.locked) writes[nightLockedPath(code)] = after.night.locked;
  for (const id of unionKeys(before.night.killed, after.night.killed)) {
    const a = hasOwn(before.night.killed, id);
    const b = hasOwn(after.night.killed, id);
    if (a !== b) writes[nightKilledPath(code, id)] = b ? true : null;
  }

  for (const id of unionKeys(before.events, after.events)) {
    const a = getOwn(before.events, id);
    const b = getOwn(after.events, id);
    if (a?.killedAt !== b?.killedAt) writes[playerEntryPath(code, 'events', id)] = b ? { killedAt: b.killedAt } : null;
  }

  return writes;
}
