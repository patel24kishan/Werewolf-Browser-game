'use client';
import { useState, type ReactNode } from 'react';
import type { RoomState } from '@/game';
import type { Room } from '@/net';
import { AssignSheriff } from './AssignSheriff';
import { readStepDone, sheriffCandidates, writeStepDone } from './sheriffStep';

export interface SheriffHostProps {
  room: Room;
  state: RoomState;
  code: string;
  /** The normal host screen. Gets a function that opens the Assign screen (undefined when the Sheriff is off). */
  children: (openSheriff: (() => void) | undefined) => ReactNode;
}

/**
 * Wraps the host's post-deal screen. Shows "Who's the Sheriff?" right after the deal
 * (until Assign or Skip), or on request to reassign. The step's "done" mark is kept in
 * sessionStorage per room code (a flag only, no roles), cleared while the room is in the lobby.
 */
export function SheriffHost({ room, state, code, children }: SheriffHostProps) {
  const [done, setDone] = useState<boolean>(() => readStepDone(code));
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const on = state.meta.sheriffOn;
  const first = on && state.meta.status === 'dealt' && state.sheriff === null && !done;

  if (!on) return <>{children(undefined)}</>;
  if (!first && !open) return <>{children(() => setOpen(true))}</>;

  function finish() {
    writeStepDone(code);
    setDone(true);
    setOpen(false);
  }

  async function run(action: { type: 'assignSheriff'; playerId: string } | { type: 'skipSheriff' }) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await room.dispatch(action);
      if (result.ok) finish();
      else setError("Couldn't save that. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AssignSheriff
      players={sheriffCandidates(state)}
      busy={busy}
      error={error}
      eyebrow={first ? 'After the deal' : 'Sheriff'}
      onBack={first ? undefined : () => setOpen(false)}
      onAssign={(playerId) => void run({ type: 'assignSheriff', playerId })}
      onSkip={() => void run({ type: 'skipSheriff' })}
    />
  );
}
