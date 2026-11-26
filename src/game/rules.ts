/**
 * Read-only access to the rules data in `src/game/data/`.
 * Source: `design/rules/02-roles.md` and `design/rules/03-setup-and-card-mix.md`.
 */
import cardMixData from './data/card-mix.json';
import rolesData from './data/roles.json';
import rulesData from './data/rules.json';
import { hasOwn } from './ids';
import type { CardMixRow, DealtRoleId, RoleId, RoleInfo, SpecialRoleId } from './types';

/** Every role id, in display order. Matches the keys of `data/roles.json`. */
export const ROLE_IDS: readonly RoleId[] = [
  'werewolf',
  'villager',
  'seer',
  'witch',
  'hunter',
  'cupid',
  'little-girl',
  'thief',
  'sheriff',
];

/** Role data keyed by id (`data/roles.json`). */
export const ROLES: Readonly<Record<RoleId, RoleInfo>> = rolesData as Record<RoleId, RoleInfo>;

/** Special roles (each replaces one Simple Villager), in canonical deck order. */
export const SPECIAL_ROLE_IDS: readonly SpecialRoleId[] = ROLE_IDS.filter(
  (id) => ROLES[id].special,
) as SpecialRoleId[];

/** Roles that can be dealt (everything except the Sheriff title). */
export const DEALT_ROLE_IDS: readonly DealtRoleId[] = ROLE_IDS.filter(
  (id) => ROLES[id].dealt,
) as DealtRoleId[];

const CARD_MIX: Readonly<Record<string, CardMixRow>> = cardMixData as Record<string, CardMixRow>;
const PLAYER_COUNTS: readonly number[] = Object.keys(CARD_MIX)
  .map(Number)
  .sort((a, b) => a - b);

/** Smallest supported player count (lowest key in `data/card-mix.json`). */
export const MIN_PLAYERS: number = PLAYER_COUNTS[0];
/** Largest supported player count (highest key in `data/card-mix.json`). */
export const MAX_PLAYERS: number = PLAYER_COUNTS[PLAYER_COUNTS.length - 1];

/** Extra Simple Villagers added to the deck when the Thief is in play. */
export const THIEF_EXTRA_VILLAGERS: number = rulesData.thiefExtraVillagers;
/** Shortest allowed player name, after trimming. */
export const NAME_MIN_LENGTH: number = rulesData.nameMinLength;
/** Longest allowed player name, after trimming (counted in Unicode code points). */
export const NAME_MAX_LENGTH: number = rulesData.nameMaxLength;

/** Player count a new room starts with. */
export const DEFAULT_PLAYER_COUNT: number = rulesData.defaultPlayerCount;
/** Whether a new room starts with the Sheriff election switched on. */
export const DEFAULT_SHERIFF_ON: boolean = rulesData.defaultSheriffOn;

/** The base mix for `playerCount`, or undefined if the count is unsupported. */
export function getCardMix(playerCount: number): CardMixRow | undefined {
  if (!Number.isInteger(playerCount)) return undefined;
  const key = String(playerCount);
  return hasOwn(CARD_MIX, key) ? CARD_MIX[key] : undefined;
}

/** True if `value` is a known role id. */
export function isRoleId(value: unknown): value is RoleId {
  return typeof value === 'string' && (ROLE_IDS as readonly string[]).includes(value);
}

/** True if `value` is a role id that can be dealt (not the Sheriff). */
export function isDealtRoleId(value: unknown): value is DealtRoleId {
  return typeof value === 'string' && (DEALT_ROLE_IDS as readonly string[]).includes(value);
}

/** True if `value` is one of the optional special roles. */
export function isSpecialRoleId(value: unknown): value is SpecialRoleId {
  return typeof value === 'string' && (SPECIAL_ROLE_IDS as readonly string[]).includes(value);
}

/** Role data for `id`. */
export function getRole(id: RoleId): RoleInfo {
  return ROLES[id];
}
