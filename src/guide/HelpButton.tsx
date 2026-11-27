'use client';
import { useRef, useState } from 'react';
import { Guide } from './Guide';

/** The "?" button for a top bar. The guide is only rendered while it is open. */
export function HelpButton() {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  function close() {
    setOpen(false);
    buttonRef.current?.focus();
  }

  return (
    <>
      <button ref={buttonRef} type="button" className="icon-btn" aria-label="How to play" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9.5" />
          <path d="M9.4 9.3a2.7 2.7 0 0 1 5.2.9c0 1.8-2.6 2.2-2.6 3.9M12 17.2h.01" />
        </svg>
      </button>
      {open ? <Guide onClose={close} /> : null}
    </>
  );
}
