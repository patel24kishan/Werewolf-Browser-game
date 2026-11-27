'use client';
import { useSyncExternalStore } from 'react';
import { ROLES, hasOwn, type RoleId } from '@/game';

export interface RoleCardProps {
  /** The role to show. Unknown ids fall back to a neutral card. */
  role: string;
  faceUp: boolean;
  onToggle: () => void;
  /** Element for the role name under the card (the screen's page heading when face up). */
  nameTag?: 'h1' | 'h2' | 'p';
}

const CARD_BACK = '/cards/card-back.png';
const FALLBACK = { name: 'Unknown card', power: 'Ask the host which role you hold.', art: null } as const;

/** Looks the role up in `roles.json` by id only; raw data never reaches a URL. */
export function lookupRole(role: string): { name: string; power: string; art: string | null } {
  if (!hasOwn(ROLES, role)) return FALLBACK;
  const info = ROLES[role as RoleId];
  return { name: info.name, power: info.power, art: info.art };
}

function subscribeMotion(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => undefined;
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');
  query.addEventListener?.('change', onChange);
  return () => query.removeEventListener?.('change', onChange);
}

function motionSnapshot(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** True while the OS asks for reduced motion (false on the server). */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeMotion, motionSnapshot, () => false);
}

/**
 * One tappable card: face down shows the card back, face up the role art.
 * The whole card is a single toggle button. The name and power sit under it.
 */
export function RoleCard({ role, faceUp, onToggle, nameTag: Name = 'p' }: RoleCardProps) {
  const reduced = usePrefersReducedMotion();
  const info = lookupRole(role);
  const label = faceUp ? `Your card: ${info.name}. Tap to hide.` : 'Your card, face down. Tap to reveal.';
  return (
    <div className="rcard" data-motion={reduced ? 'reduced' : 'full'} data-face={faceUp ? 'up' : 'down'}>
      <button type="button" className="rcard__btn" aria-pressed={faceUp} aria-label={label} onClick={onToggle}>
        <span className="rcard__flip">
          <span className="rcard__face rcard__face--back">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={CARD_BACK} alt="" draggable={false} />
          </span>
          <span className="rcard__face rcard__face--front">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={info.art ? `/cards/${info.art}` : CARD_BACK} alt="" draggable={false} />
          </span>
        </span>
      </button>
      {faceUp ? (
        <div className="rcard__caption">
          <Name className="rcard__name">{info.name}</Name>
          <p className="rcard__power">{info.power}</p>
        </div>
      ) : null}
    </div>
  );
}
