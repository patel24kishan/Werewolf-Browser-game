'use client';
import { useRef, useState } from 'react';
import { hasOwn, type RoomState } from '@/game';
import type { Room } from '@/net';
import { EndGameSheet } from '../gameover/EndGameSheet';
import { Dashboard } from './Dashboard';
import { DawnScreen } from './DawnScreen';
import type { DashPlayer } from './types';

type GameAction = Parameters<Room['dispatch']>[0];

/** The moderating host's game flow after the deal: dashboard, confirm, dawn / reveal. */
export function HostGame({ room, state, onOpenSheriff }: { room: Room; state: RoomState; onOpenSheriff?: () => void }) {
  // Action types still being written. On Firebase the host's view shows a write
  // before the server confirms it, so the next screen (e.g. Dawn after Lock in)
  // can appear while the previous action is in flight. Taps for a different action
  // are therefore passed on, not dropped: `room.dispatch` already runs actions one
  // at a time, in order. Only a repeat of an action that is still in flight is ignored.
  const inFlight = useRef(new Set<string>());
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const busy = pending.size > 0;
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

  async function run(action: GameAction, failure: string, dedupe = true) {
    if (dedupe && inFlight.current.has(action.type)) return;
    if (dedupe) {
      inFlight.current.add(action.type);
      setPending(new Set(inFlight.current));
    }
    setError(null);
    try {
      const result = await room.dispatch(action);
      if (!result.ok) setError(failure);
    } finally {
      if (dedupe) {
        inFlight.current.delete(action.type);
        setPending(new Set(inFlight.current));
      }
    }
  }

  const status = state.meta.status;
  if (status === 'night' && state.night.locked) {
    return (
      <DawnScreen
        victims={players.filter((p) => p.killed).map((p) => p.name)}
        busy={pending.has('reveal')}
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
