'use client';
import { lookupRole, usePrefersReducedMotion } from '@/card/RoleCard';
import { PageShell } from '@/ui/components';
import { useAttackPlayback } from './useAttackPlayback';

export interface AttackOverlayProps {
  name: string;
  code: string;
  playerId: string;
  /** The player's own role id. */
  role: string;
  /** `events[myId].killedAt`; undefined when the player is dead without an event to play. */
  killedAt?: number;
  /** A calm line above the card (e.g. the game is over). */
  notice?: string;
}

/**
 * The victim's screen: claw slashes and a red flash once, then the persistent dead state
 * (card face up, marked with claws). Reduced motion skips straight to the static frame.
 */
export function AttackOverlay({ name, code, playerId, role, killedAt, notice }: AttackOverlayProps) {
  const reduced = usePrefersReducedMotion();
  const { playing, strong } = useAttackPlayback(code, playerId, killedAt);
  const info = lookupRole(role);
  const animate = playing && !reduced;

  return (
    <PageShell>
      <div className="dead-bg" aria-hidden="true" />
      {animate ? <div className="attack-flash" data-strong={strong ? 'true' : 'false'} aria-hidden="true" /> : null}
      <p className="sr-only" aria-live="assertive">
        {playing ? 'You were killed in the night.' : ''}
      </p>
      <div className="topbar">
        <span className="cardscreen__name">{name}</span>
        <span className="dead-pill">Dead</span>
      </div>
      {notice ? (
        <p className="notice notice--calm" role="status">
          {notice}
        </p>
      ) : null}
      <div className="dead" data-playing={animate ? 'true' : 'false'} data-reduced={reduced ? 'true' : 'false'}>
        <h1 className="title title--md center dead__title">The wolves got you</h1>
        <div className="dead-card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={info.art ? `/cards/${info.art}` : '/cards/card-back.png'} alt={`Your card: ${info.name}`} draggable={false} />
          <svg className="dead-card__claws" viewBox="0 0 290 290" aria-hidden="true" data-testid="claws">
            <g fill="none" strokeWidth="14" strokeLinecap="round">
              <path d="M60 20 C120 110 170 190 230 280" />
              <path d="M100 6 C160 100 205 170 270 250" />
              <path d="M28 60 C90 140 130 210 190 290" />
              <path d="M142 0 C190 70 240 130 290 190" />
            </g>
          </svg>
        </div>
        <div className="dead__text">
          <p className="dead__lead">You were killed in the night.</p>
          <p className="dead__body">Show your card to the table, then stay silent for the rest of the game.</p>
        </div>
      </div>
    </PageShell>
  );
}
