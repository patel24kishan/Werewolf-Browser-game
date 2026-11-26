/**
 * Building, shuffling and dealing the deck.
 * Source: `design/rules/03-setup-and-card-mix.md` ("Card counts by player count",
 * "Adding special roles", "The Thief adds cards").
 */
import { fail } from './errors';
import { isSafeId } from './ids';
import {
  DEALT_ROLE_IDS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  SPECIAL_ROLE_IDS,
  THIEF_EXTRA_VILLAGERS,
  getCardMix,
  isDealtRoleId,
  isSpecialRoleId,
} from './rules';
import type {
  BuildDeckResult,
  DealResult,
  DealtRoleId,
  Failure,
  PlayerId,
  RoleId,
  SpecialRoleId,
} from './types';

/**
 * Checks a special-role list and returns it in canonical order
 * (`SPECIAL_ROLE_IDS` order), or a failure.
 */
export function normalizeSpecialRoles(
  specialRoles: unknown,
): { ok: true; roles: SpecialRoleId[] } | Failure {
  if (!Array.isArray(specialRoles)) {
    return fail('invalid-role', 'specialRoles must be an array of special role ids.');
  }
  const seen: SpecialRoleId[] = [];
  for (const role of specialRoles) {
    if (!isSpecialRoleId(role)) {
      return fail('invalid-role', `"${String(role)}" is not a special role.`);
    }
    if (seen.includes(role)) {
      return fail('duplicate-role', `"${role}" can be chosen at most once.`);
    }
    seen.push(role);
  }
  return { ok: true, roles: SPECIAL_ROLE_IDS.filter((id) => seen.includes(id)) };
}

/**
 * Builds the unshuffled deck for `playerCount` players.
 *
 * - The base mix (werewolves, one Seer, Simple Villagers) comes from `data/card-mix.json`.
 * - Each special role replaces one Simple Villager; the werewolf count never changes.
 * - The Thief also adds `THIEF_EXTRA_VILLAGERS` (2) Simple Villagers, so the deck has
 *   `playerCount + 2` cards.
 * - The Sheriff is never in the deck.
 *
 * Card order is canonical (werewolves, seer, specials, villagers) regardless of the
 * order of `specialRoles`. Invalid input returns a failure; nothing is thrown.
 */
export function buildDeck(playerCount: number, specialRoles: readonly SpecialRoleId[]): BuildDeckResult {
  const mix = getCardMix(playerCount);
  if (mix === undefined) {
    return fail(
      'invalid-player-count',
      `Player count must be a whole number from ${MIN_PLAYERS} to ${MAX_PLAYERS}.`,
    );
  }
  const specials = normalizeSpecialRoles(specialRoles);
  if (!specials.ok) return specials;
  if (specials.roles.length > mix.villagers) {
    return fail(
      'too-many-specials',
      `${playerCount} players allow at most ${mix.villagers} special roles.`,
    );
  }

  const deck: DealtRoleId[] = [];
  for (let i = 0; i < mix.werewolves; i++) deck.push('werewolf');
  for (let i = 0; i < mix.seer; i++) deck.push('seer');
  for (const role of specials.roles) deck.push(role);
  let villagers = mix.villagers - specials.roles.length;
  if (specials.roles.includes('thief')) villagers += THIEF_EXTRA_VILLAGERS;
  for (let i = 0; i < villagers; i++) deck.push('villager');
  return { ok: true, deck };
}

/** Picks an index in [0, bound) from one rng draw, clamping out-of-range draws. */
function pickIndex(rng: () => number, bound: number): number {
  const r = rng();
  if (!(r >= 0)) return 0; // also catches NaN
  const index = Math.floor(r * bound);
  return index >= bound ? bound - 1 : index;
}

/**
 * Returns a shuffled copy of `deck` (Fisher–Yates). `rng` must return numbers in
 * [0, 1); draws outside that range are clamped. The input is not modified.
 */
export function shuffle<T>(deck: readonly T[], rng: () => number): T[] {
  const out = deck.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = pickIndex(rng, i + 1);
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/**
 * Shuffles `deck` and gives one card to each id in `playerIds`, in order.
 *
 * The deck must hold exactly one card per player, or one per player plus
 * `THIEF_EXTRA_VILLAGERS` when it contains the Thief; those leftovers are returned
 * as `spares`. Ids must be unique safe ids. Inputs are not modified.
 */
export function deal(
  playerIds: readonly PlayerId[],
  deck: readonly DealtRoleId[],
  rng: () => number,
): DealResult {
  if (!Array.isArray(playerIds) || !Array.isArray(deck)) {
    return fail('invalid-action', 'playerIds and deck must be arrays.');
  }
  const seen = new Set<string>();
  for (const id of playerIds) {
    if (!isSafeId(id)) return fail('invalid-id', 'Every player id must be a safe id.');
    if (seen.has(id)) return fail('duplicate-player', `Player "${id}" appears twice.`);
    seen.add(id);
  }
  for (const card of deck) {
    if (!isDealtRoleId(card)) return fail('invalid-role', `"${String(card)}" cannot be dealt.`);
  }
  const hasThief = deck.includes('thief');
  const expected = playerIds.length + (hasThief ? THIEF_EXTRA_VILLAGERS : 0);
  if (deck.length !== expected) {
    return fail(
      'deck-size-mismatch',
      `Deck has ${deck.length} cards; ${playerIds.length} players need ${expected}.`,
    );
  }

  const shuffled = shuffle(deck, rng);
  const cards: Record<PlayerId, DealtRoleId> = {};
  playerIds.forEach((id, i) => {
    cards[id] = shuffled[i];
  });
  return { ok: true, cards, spares: shuffled.slice(playerIds.length) };
}

/**
 * Counts cards by role, e.g. `{ werewolf: 2, seer: 1, villager: 5 }` — the
 * `deck` shape shown in the architecture doc, for the Review deck screen.
 * Roles with zero cards are omitted.
 */
export function countRoles(cards: readonly RoleId[]): Partial<Record<RoleId, number>> {
  const counts: Partial<Record<RoleId, number>> = {};
  for (const role of DEALT_ROLE_IDS) {
    const n = cards.filter((c) => c === role).length;
    if (n > 0) counts[role] = n;
  }
  return counts;
}
