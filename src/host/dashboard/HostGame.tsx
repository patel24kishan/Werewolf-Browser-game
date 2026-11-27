'use client';
import { useState } from 'react';
import { hasOwn, type RoomState } from '@/game';
import type { Room } from '@/net';
import { EndGameSheet } from '../gameover/EndGameSheet';
import { Dashboard } from './Dashboard';
import { DawnScreen } from './DawnScreen';
import type { DashPlayer } from './types';

type GameAction = Parameters<Room['dispatch']>[0];

/** The moderating host's game flow after the deal: dashboard, confirm, dawn / reveal. */
export function HostGame({ room, state, onOpenSheriff }: { room: Room; state: RoomState; onOpenSheriff?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);

  const players: DashPlayer[] = Object.entries(state.players)
    .filter(([id]) => id !== state.meta.hostId && hasOwn(state.cards, id))
    .map(([id, p]) => ({
      id,
      name: p.name,
      role: state.cards[id].role,
      alive: p.alive,
      sheriff: state.sheriff === id,
      killed: p.alive && hasOwn(state.night.killed, id),
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

  async function run(action: GameAction, failure: string, guard = true) {
    if (guard && busy) return;
    if (guard) setBusy(true);
    setError(null);
    try {
      const result = await room.dispatch(action);
      if (!result.ok) setError(failure);
    } finally {
      if (guard) setBusy(false);
    }
  }

  const status = state.meta.status;
  if (status === 'night' && state.night.locked) {
    return (
      <DawnScreen
        victims={players.filter((p) => p.killed).map((p) => p.name)}
        busy={busy}
        error={error}
        onReveal={() => void run({ type: 'reveal' }, "Couldn't reveal. Try again.")}
        onUndoLock={() => void run({ type: 'undoConfirm' }, "Couldn't undo the lock. Try again.")}
      />
    );
  }
  return (
    <>
      <Dashboard
        status={status === 'night' || status === 'day' ? status : 'dealt'}
        players={players}
        busy={busy}
        error={error}
        onSheriff={onOpenSheriff}
        onEndGame={() => setEnding(true)}
        onToggleKilled={(playerId) => void run({ type: 'toggleKilled', playerId }, "Couldn't change that. Try again.", false)}
        onNightFalls={() => void run({ type: 'startNight' }, "Couldn't start the night. Try again.")}
        onLockIn={() => void run({ type: 'confirmKills' }, "Couldn't lock in. Try again.")}
      />
      {ending ? (
        <EndGameSheet
          onCancel={() => setEnding(false)}
          onConfirm={() => {
            setEnding(false);
            void run({ type: 'endGame' }, "Couldn't end the game. Try again.");
          }}
        />
      ) : null}
    </>
  );
}
