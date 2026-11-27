'use client';
import { Button, PageShell } from '@/ui/components';

export interface DawnScreenProps {
  /** Names of the locked-in victims. */
  victims: string[];
  busy: boolean;
  error: string | null;
  onReveal: () => void;
  onUndoLock: () => void;
}

function note(victims: string[]): string {
  if (victims.length === 0) return 'Nobody was killed tonight. No phone will react.';
  if (victims.length === 1) return `${victims[0]}'s phone will shake and show the werewolf attack.`;
  return `${victims.length} phones will shake and show the werewolf attack.`;
}

/** Dawn: the kills are locked; say the line aloud, then press Reveal. */
export function DawnScreen({ victims, busy, error, onReveal, onUndoLock }: DawnScreenProps) {
  const n = victims.length;
  return (
    <PageShell
      footer={
        <Button variant="secondary" disabled={busy} onClick={onUndoLock}>
          Undo lock
        </Button>
      }
    >
      <div className="dash__head dash__head--row">
        <h1 className="dash__title">Dawn</h1>
        <span className="badge-kill">{n === 0 ? 'No kills locked' : `${n} ${n === 1 ? 'kill' : 'kills'} locked`}</span>
      </div>
      <div className="say">
        <p className="dash__eyebrow">Say out loud</p>
        <p className="say__text">&ldquo;The sun rises. Everyone, open your eyes…&rdquo;</p>
      </div>
      {error ? (
        <p className="notice" role="alert">
          {error}
        </p>
      ) : null}
      <div className="reveal">
        <button type="button" className="reveal-btn" aria-busy={busy || undefined} onClick={() => (busy ? undefined : onReveal())}>
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </svg>
          <span>Reveal</span>
        </button>
        <p className="hint center">{note(victims)}</p>
      </div>
    </PageShell>
  );
}
