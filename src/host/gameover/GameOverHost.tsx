'use client';
import { useState } from 'react';
import type { RoomState } from '@/game';
import type { Room } from '@/net';
import { GameOver } from './GameOver';
import { hostOwnName, nextHostCandidates } from './candidates';

/** The host's Game over screen wired to the room. Mounted only for the host in status `over`. */
export function GameOverHost({ room, state, onEnded }: { room: Room; state: RoomState; onEnded: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setUp(newHostId: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await room.dispatch({ type: 'chooseNextHost', newHostId });
      if (!result.ok) setError("Couldn't set up the next game. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function endSession() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await room.deleteRoom();
      if (result.ok) onEnded();
      else setError("Couldn't end the session. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <GameOver
      hostId={state.meta.hostId}
      hostName={hostOwnName(state)}
      candidates={nextHostCandidates(state)}
      busy={busy}
      error={error}
      onSetUp={(id) => void setUp(id)}
      onEndSession={() => void endSession()}
    />
  );
}
