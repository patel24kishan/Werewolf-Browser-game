'use client';
import { useState } from 'react';
import type { PlayerId, RoomState } from '@/game';
import { Button, ConfirmSheet, PageShell, PlayerRow, TopBar } from '@/ui/components';
import { startStatus } from '../deckInfo';

export interface LobbyStepProps {
  code: string;
  state: RoomState;
  myId: PlayerId;
  busy: boolean;
  error: string | null;
  onRemove: (playerId: PlayerId) => void;
  onStart: () => void;
  onBack: () => void;
}

/** Lobby: who joined, who is ready, remove a player, and Start. */
export function LobbyStep({ code, state, myId, busy, error, onRemove, onStart, onBack }: LobbyStepProps) {
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);
  const status = startStatus(state);
  const playing = state.meta.hostMode === 'playing';
  const players = Object.entries(state.players)
    // A moderating host's leftover record is not a player.
    .filter(([id]) => id !== state.meta.hostId || playing)
    .map(([id, p]) => ({ id, name: p.name, ready: p.ready }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

  return (
    <PageShell
      footer={
        <Button disabled={!status.enabled} busy={busy} busyLabel="Dealing…" onClick={onStart}>
          {status.label}
        </Button>
      }
    >
      <TopBar onBack={onBack}>
        <h1 className="title title--md" style={{ flexGrow: 1 }}>
          Lobby
        </h1>
        <span className="pill" aria-label={`Game code ${code}`}>
          {code}
        </span>
      </TopBar>
      <div className="stat-grid" aria-live="polite">
        <div className="stat">
          <p className="stat__label">Joined</p>
          <p className="stat__value">
            {status.joined} / {status.required}
          </p>
        </div>
        <div className="stat">
          <p className="stat__label">Ready</p>
          <p className="stat__value">
            {status.ready} / {status.required}
          </p>
        </div>
      </div>
      {error ? (
        <p className="notice" role="alert">
          {error}
        </p>
      ) : null}
      <ul className="rows" aria-label="Players">
        {players.map((p) => {
          const isHost = p.id === state.meta.hostId;
          return (
            <PlayerRow
              key={p.id}
              compact
              name={p.name}
              ready={isHost || p.ready}
              isYou={p.id === myId}
              statusText={isHost ? 'Host' : undefined}
              action={
                isHost ? null : (
                  <button type="button" className="row__remove" aria-label={`Remove ${p.name}`} onClick={() => setRemoving({ id: p.id, name: p.name })}>
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      aria-hidden="true"
                    >
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                )
              }
            />
          );
        })}
      </ul>
      {players.length === 0 ? <p className="lede lede--sm">Nobody has joined yet. Share the code {code} to bring players in.</p> : null}
      {removing ? (
        <ConfirmSheet
          title={`Remove ${removing.name}?`}
          body="They will be taken out of this game. They can join again with the code."
          cancelLabel="Keep"
          confirmLabel="Remove"
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            onRemove(removing.id);
            setRemoving(null);
          }}
        />
      ) : null}
    </PageShell>
  );
}
