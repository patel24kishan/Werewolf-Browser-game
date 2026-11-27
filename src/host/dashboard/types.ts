import type { PlayerId } from '@/game';

/** One dealt player as the host's dashboard sees them. The role is shown only in the card overlay. */
export interface DashPlayer {
  id: PlayerId;
  name: string;
  role: string;
  alive: boolean;
  killed: boolean;
  /** Holds the Sheriff card (also when dead). */
  sheriff?: boolean;
}

export type DashStatus = 'dealt' | 'night' | 'day';

/** Text for the primary "lock in" button. */
export function lockLabel(count: number): string {
  if (count === 0) return 'Lock in — no kills tonight';
  return `Lock in ${count} ${count === 1 ? 'kill' : 'kills'}`;
}
