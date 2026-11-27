/**
 * Pure helpers for the host setup screens: the rulebook hint, the review-deck
 * summary and the Start button's label. No React; the rules come from `@/game`.
 */
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  THIEF_EXTRA_VILLAGERS,
  buildDeck,
  checkStartRule,
  countRoles,
  getCardMix,
  getRole,
  type DealtRoleId,
  type RoomState,
  type SpecialRoleId,
} from '@/game';

/** Clamps a player count into the supported range. */
export function clampCount(n: number): number {
  return Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, Math.round(n)));
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The rulebook mix for a count, as parts for the hint line. Null for an unsupported count. */
export function rulebookHint(playerCount: number): { werewolves: string; seer: string; text: string } | null {
  const mix = getCardMix(playerCount);
  if (!mix) return null;
  const werewolves = plural(mix.werewolves, 'Werewolf', 'Werewolves');
  const seer = plural(mix.seer, 'Seer', 'Seers');
  return {
    werewolves,
    seer,
    text: `From the rulebook for ${playerCount} players: ${werewolves}, ${seer}, the rest Villagers.`,
  };
}

export interface ReviewRow {
  role: DealtRoleId;
  name: string;
  art: string;
  count: number;
}

export type Review = { ok: true; rows: ReviewRow[]; total: number; summary: string } | { ok: false; message: string };

/** The cards the deck will hold, with counts and the "N cards for N players" line. */
export function reviewDeck(playerCount: number, specialRoles: readonly SpecialRoleId[]): Review {
  const built = buildDeck(playerCount, specialRoles);
  if (!built.ok)
    return {
      ok: false,
      message: deckErrorMessage(built.error.code, playerCount),
    };
  const counts = countRoles(built.deck);
  const rows = (Object.keys(counts) as DealtRoleId[]).map((role) => ({
    role,
    name: getRole(role).name,
    art: getRole(role).art,
    count: counts[role] ?? 0,
  }));
  const total = built.deck.length;
  const summary = specialRoles.includes('thief')
    ? `${total} cards: ${playerCount} players + ${THIEF_EXTRA_VILLAGERS} spare for the Thief`
    : `${total} cards for ${playerCount} players`;
  return { ok: true, rows, total, summary };
}

/** Plain-words text for a `buildDeck` failure. */
export function deckErrorMessage(code: string, playerCount: number): string {
  if (code === 'too-many-specials') {
    const max = getCardMix(playerCount)?.villagers ?? 0;
    return `${playerCount} players allow at most ${max} special roles. Remove some or add players.`;
  }
  if (code === 'invalid-player-count') return `Choose ${MIN_PLAYERS} to ${MAX_PLAYERS} players.`;
  return 'That deck does not work. Change the roles and try again.';
}

export interface StartStatus {
  enabled: boolean;
  /** The button label, which also says why Start is blocked. */
  label: string;
  joined: number;
  required: number;
  ready: number;
}

function nameList(names: string[]): string {
  if (names.length <= 2) return names.join(' and ');
  return `${names.length} players`;
}

/** What the Start button says and whether it may be pressed (from `checkStartRule`). */
export function startStatus(state: RoomState): StartStatus {
  const check = checkStartRule(state);
  // A playing host counts as ready (pressing Start is their ready).
  const ready = Math.max(0, check.joined - check.notReady.length - (check.hostNeedsName ? 1 : 0));
  const base = { joined: check.joined, required: check.required, ready };
  if (check.ok) return { ...base, enabled: true, label: 'Start' };
  if (check.hostNeedsName) return { ...base, enabled: false, label: 'Start — add your name first' };
  if (check.joined > check.required) {
    return {
      ...base,
      enabled: false,
      label: `Start — too many players: remove ${check.joined - check.required}`,
    };
  }
  if (check.joined < check.required) {
    const n = check.required - check.joined;
    return {
      ...base,
      enabled: false,
      label: `Start — ${n} more ${n === 1 ? 'player' : 'players'} needed`,
    };
  }
  const names = check.notReady.map((id) => (Object.hasOwn(state.players, id) ? state.players[id].name : 'someone')).sort((a, b) => a.localeCompare(b));
  return {
    ...base,
    enabled: false,
    label: `Start — waiting for ${nameList(names)}`,
  };
}
