'use client';
import { useEffect, useRef } from 'react';
import { lookupRole } from '@/card/RoleCard';

export interface CardOverlayProps {
  name: string;
  role: string;
  onClose: () => void;
  /** The element to give focus back to on close (the player's name button). */
  returnTo: HTMLElement | null;
}

/** Full-screen card view (70% black). Tap anywhere, the X or Escape closes it. */
export function CardOverlay({ name, role, onClose, returnTo }: CardOverlayProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const info = lookupRole(role);

  useEffect(() => {
    closeRef.current?.focus();
    return () => returnTo?.focus();
  }, [returnTo]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      } else if (event.key === 'Tab') {
        // Only the close button is focusable in here.
        event.preventDefault();
        closeRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="cardview" role="dialog" aria-modal="true" aria-label={`${name}'s card`} onClick={onClose}>
      <button
        ref={closeRef}
        type="button"
        className="cardview__close"
        aria-label="Close card"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
      <p className="cardview__who">{name}</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="cardview__art" src={info.art ? `/cards/${info.art}` : '/cards/card-back.png'} alt="" draggable={false} />
      <div className="cardview__caption">
        <h2 className="cardview__role">{info.name}</h2>
        <p className="cardview__power">{info.power}</p>
      </div>
      <p className="caption">Tap anywhere to close</p>
    </div>
  );
}
