import type { RoomState } from '@/game';

export interface NextHostCandidate {
  id: string;
  name: string;
}

/** Every player with a record except the current host, by name. Names are plain text. */
export function nextHostCandidates(state: RoomState): NextHostCandidate[] {
  return Object.entries(state.players)
    .filter(([id]) => id !== state.meta.hostId)
    .map(([id, p]) => ({ id, name: p.name }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

/** The current host's own name, when they have a player record. */
export function hostOwnName(state: RoomState): string | null {
  return Object.hasOwn(state.players, state.meta.hostId) ? state.players[state.meta.hostId].name : null;
}
