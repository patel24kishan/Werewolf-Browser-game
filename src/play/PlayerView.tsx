'use client';
import { CardScreen, type CardScreenProps } from './CardScreen';
import { SheriffScreen } from './SheriffScreen';

/** A player's screen after the deal: the Sheriff card for a living Sheriff, else the role card (or the dead screen). */
export function PlayerView({ isSheriff, ...card }: CardScreenProps & { isSheriff: boolean }) {
  const dead = card.alive === false || card.killedAt !== undefined;
  return isSheriff && !dead ? <SheriffScreen {...card} /> : <CardScreen {...card} />;
}
