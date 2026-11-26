/**
 * Creating a room state and the start rule.
 * Source: `design/companion-flow.md` ("Start rule") and `plan.md` feature 2.
 */
import { fail } from './errors';
import { compareOrdinal, getOwnRecord, hasOwn, isSafeId, safeKeys } from './ids';
import { DEFAULT_PLAYER_COUNT, DEFAULT_SHERIFF_ON } from './rules';
import type { NightState, PlayerId, RoomState, StartCheck, StateResult } from './types';

/** A fresh, unlocked night with no kills. */
export function emptyNight(): NightState {
  return { killed: {}, locked: false };
}

/**
 * The state of a newly created room: status `lobby`, host moderating, the
 * default Sheriff switch and player count from `data/rules.json`, no special
 * roles, nobody joined. `createdAt` is supplied by the caller (ms since the epoch). The host is not a player record; a host who will
 * play joins like anyone else so they have a name.
 */
export function newRoomState(hostId: PlayerId, createdAt: number): StateResult {
  if (!isSafeId(hostId)) return fail('invalid-id', 'hostId must be a safe id.');
  if (typeof createdAt !== 'number' || !Number.isFinite(createdAt)) {
    return fail('invalid-context', 'createdAt must be a finite number.');
  }
  return {
    ok: true,
    state: {
      meta: { hostId, hostMode: 'moderating', status: 'lobby', sheriffOn: DEFAULT_SHERIFF_ON, createdAt },
      deck: { playerCount: DEFAULT_PLAYER_COUNT, specialRoles: [] },
      players: {},
      cards: {},
      spares: [],
      sheriff: null,
      night: emptyNight(),
      events: {},
    },
  };
}

/**
 * The ids that count toward the deal, sorted ordinally:
 * every player record except the host's, plus the host when the host is playing.
 * A moderating host is never counted, even if they have a player record.
 * A playing host is always counted (treated as present, whether or not they
 * have a record yet — `checkStartRule` then reports `hostNeedsName`).
 */
export function countedPlayerIds(state: RoomState): PlayerId[] {
  const hostId = state.meta.hostId;
  const ids = safeKeys(state.players).filter((id) => id !== hostId);
  if (state.meta.hostMode === 'playing') ids.push(hostId);
  return ids.sort(compareOrdinal);
}

/**
 * The start rule: the host may deal only when the number of counted players
 * equals `deck.playerCount` and every counted player is Ready.
 *
 * - A moderating host is not counted.
 * - A playing host is counted and does not need to tap Ready (pressing Start is
 *   their ready), but must have a player record so they have a name.
 * - `connected` is not checked: a phone that briefly dropped still counts.
 */
export function checkStartRule(state: RoomState): StartCheck {
  const hostId = state.meta.hostId;
  const counted = countedPlayerIds(state);
  const notReady = counted.filter((id) => {
    if (id === hostId) return false;
    const record = getOwnRecord(state.players, id);
    return record === undefined || record.ready !== true;
  });
  const hostNeedsName = state.meta.hostMode === 'playing' && !hasOwn(state.players, hostId);
  const required = state.deck.playerCount;
  return {
    ok: counted.length === required && notReady.length === 0 && !hostNeedsName,
    required,
    joined: counted.length,
    notReady,
    hostNeedsName,
  };
}
