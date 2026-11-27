'use client';
import { ConfirmSheet } from '@/ui/components';

/** "End this game?" confirmation. `onConfirm` runs only after the host taps End game. */
export function EndGameSheet({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <ConfirmSheet
      title="End this game?"
      body="Everyone keeps their card until the next deal."
      cancelLabel="Keep playing"
      confirmLabel="End game"
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}
