'use client';
import { useState, useSyncExternalStore } from 'react';
import { RoleCard } from '@/card/RoleCard';
import { PageShell } from '@/ui/components';
import { AttackOverlay } from './AttackOverlay';
import { useAudioUnlock } from './attackEffects';

export interface CardScreenProps {
  name: string;
  code: string;
  /** The player's own role id (from `state.cards[myId].role`). */
  role: string;
  /** This player's id (scopes the "attack already seen" memory). */
  playerId: string;
  /** False once the host has revealed this player's death. */
  alive?: boolean;
  /** `events[myId].killedAt`, when the attack has arrived. */
  killedAt?: number;
  /** Small text buttons under the card (the host's Sheriff button, or back to the Sheriff card). */
  actions?: { label: string; onClick: () => void }[];
  /** A calm line above the card (e.g. the game is over). */
  notice?: string;
}

/** The player's card: arrives face down, tap to reveal, tap again to hide. Never persisted. */
export function CardScreen({ name, code, role, playerId, alive = true, killedAt, actions, notice }: CardScreenProps) {
  const [faceUp, setFaceUp] = useState(false);
  // Unlocks the sound for the attack on iPhone: it needs an earlier tap.
  useAudioUnlock();
  // False during server render and hydration, true after: the live region fills in after mount.
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  if (!alive || killedAt !== undefined) {
    return <AttackOverlay name={name} code={code} playerId={playerId} role={role} killedAt={killedAt} notice={notice} />;
  }
  const announce = mounted ? 'Your card has arrived' : '';

  return (
    <PageShell footer={<p className="caption center">Keep your screen away from your neighbours.</p>}>
      <div className="topbar">
        <span className="cardscreen__name">{name}</span>
        <span className="topbar__label">
          Game <b>{code}</b>
        </span>
      </div>
      {notice ? (
        <p className="notice notice--calm" role="status">
          {notice}
        </p>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
      <div className="cardscreen">
        <RoleCard role={role} faceUp={faceUp} onToggle={() => setFaceUp((v) => !v)} nameTag="h1" />
        {faceUp ? null : <h1 className="title title--md center">Your card has arrived</h1>}
        <p className="cardscreen__hint">{faceUp ? 'Tap the card again to hide it' : 'Tap the card to flip it'}</p>
        {actions?.map((a) => (
          <button key={a.label} type="button" className="textbtn" onClick={a.onClick}>
            {a.label}
          </button>
        ))}
      </div>
    </PageShell>
  );
}
