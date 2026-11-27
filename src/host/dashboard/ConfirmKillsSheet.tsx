'use client';
import { useEffect, useId, useRef } from 'react';
import { lookupRole } from '@/card/RoleCard';
import { Button } from '@/ui/components';
import type { DashPlayer } from './types';

export interface ConfirmKillsSheetProps {
  victims: DashPlayer[];
  busy: boolean;
  onUndo: (playerId: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

/** "Lock in tonight's kills?": lists the toggled players with Undo. Escape and Go back change nothing. */
export function ConfirmKillsSheet({ victims, busy, onUndo, onCancel, onConfirm }: ConfirmKillsSheetProps) {
  const titleId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    return () => previous?.focus();
  }, []);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onCancel();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = sheetRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled)');
    if (!items || items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onCancel} onKeyDown={onKeyDown}>
      <div ref={sheetRef} className="sheet sheet--danger" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(e) => e.stopPropagation()}>
        <div className="sheet__grabber" aria-hidden="true" />
        <h2 id={titleId} className="title title--md">
          Lock in tonight&apos;s kills?
        </h2>
        <p className="lede lede--sm">They won&apos;t know until you press Reveal at dawn.</p>
        {victims.length === 0 ? (
          <p className="lede lede--sm">Nobody is marked. The night will pass with no kills.</p>
        ) : (
          <ul className="rows" aria-label="Tonight's kills">
            {victims.map((v) => {
              const info = lookupRole(v.role);
              return (
                <li key={v.id} className="kill-row">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={info.art ? `/cards/${info.art}` : '/cards/card-back.png'} alt="" />
                  <span className="kill-row__text">
                    <b>{v.name}</b>
                    <span>{info.name} · killed by the wolves</span>
                  </span>
                  <button type="button" className="kill-row__undo" aria-label={`Undo ${v.name}`} onClick={() => onUndo(v.id)}>
                    Undo
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="sheet__actions">
          <button ref={cancelRef} type="button" className="btn btn--surface" onClick={onCancel}>
            Go back
          </button>
          <Button variant="danger" busy={busy} busyLabel="Locking…" onClick={onConfirm}>
            Lock in
          </Button>
        </div>
      </div>
    </div>
  );
}
