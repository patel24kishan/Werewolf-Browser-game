/**
 * Werewolf Companion rules core: public API.
 *
 * Plain TypeScript with no React, Next, Firebase, DOM, ambient randomness or
 * ambient clock. Randomness and time are injected (`ActionContext`), so the
 * module ports to C#/Unity almost line by line.
 */
export type * from './types';

export { applyAction, parseAction } from './reducer';
export { buildDeck, countRoles, deal, normalizeSpecialRoles, shuffle } from './deck';
export { checkStartRule, countedPlayerIds, emptyNight, newRoomState } from './state';
export { isNameTaken, nameKey, normalizeName } from './names';
export { compareOrdinal, getOwn, hasOwn, isSafeId } from './ids';
export {
  DEALT_ROLE_IDS,
  DEFAULT_PLAYER_COUNT,
  DEFAULT_SHERIFF_ON,
  MAX_PLAYERS,
  MIN_PLAYERS,
  NAME_MAX_LENGTH,
  NAME_MIN_LENGTH,
  ROLE_IDS,
  ROLES,
  SPECIAL_ROLE_IDS,
  THIEF_EXTRA_VILLAGERS,
  getCardMix,
  getRole,
  isDealtRoleId,
  isRoleId,
  isSpecialRoleId,
} from './rules';
