import type { RoomState } from '@/game';

const key = (code: string) => `sheriff-step:${code}`;

/** True once the host has tapped Assign or Skip for this room's current game. No roles are stored. */
export function readStepDone(code: string): boolean {
  try {
    return window.sessionStorage.getItem(key(code)) === '1';
  } catch {
    return false;
  }
}

export function writeStepDone(code: string): void {
  try {
    window.sessionStorage.setItem(key(code), '1');
  } catch {
    // Without storage the step may show again after a reload; that is acceptable.
  }
}

/** Called while the room is in the lobby, so the step returns after the next deal. */
export function clearStepDone(code: string): void {
  try {
    window.sessionStorage.removeItem(key(code));
  } catch {
    // Nothing to clear.
  }
}

/** The dealt players the Sheriff card can go to: alive, holding a card, never a moderating host. */
export function sheriffCandidates(state: RoomState): { id: string; name: string }[] {
  return Object.entries(state.players)
    .filter(([id, p]) => p.alive && Object.hasOwn(state.cards, id) && !(state.meta.hostMode === 'moderating' && id === state.meta.hostId))
    .map(([id, p]) => ({ id, name: p.name }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}
