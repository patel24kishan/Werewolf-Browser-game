'use client';
import { useState } from 'react';
import { Button, CheckIcon, ConfirmSheet, PageShell, PlayerRow, TopBar } from '@/ui/components';

export interface LobbyPlayer {
  id: string;
  name: string;
  ready: boolean;
}

export interface PlayerLobbyProps {
  code: string;
  players: readonly LobbyPlayer[];
  myId: string;
  /** Players the host is waiting for (the chosen player count). */
  required: number;
  /** Counted players who have joined. */
  joined: number;
  onSetReady: (ready: boolean) => void;
  /** Called after the player confirms "Leave this game?". */
  onLeave: () => void;
}

/** The player's lobby: who has joined, and the "I'm ready" toggle. */
export function PlayerLobby({ code, players, myId, required, joined, onSetReady, onLeave }: PlayerLobbyProps) {
  const [confirming, setConfirming] = useState(false);
  const me = players.find((p) => p.id === myId);
  const iAmReady = me?.ready ?? false;

  return (
    <PageShell
      footer={
        <>
          <Button variant={iAmReady ? 'ready' : 'primary'} aria-pressed={iAmReady} onClick={() => onSetReady(!iAmReady)}>
            {iAmReady ? <CheckIcon /> : null}
            I&apos;m ready
          </Button>
          <p className="caption center">{iAmReady ? 'Tap again to undo.' : 'Tap when you are ready to play.'}</p>
        </>
      }
    >
      <TopBar onBack={() => setConfirming(true)}>
        <span className="topbar__label">
          Game <b>{code}</b>
        </span>
      </TopBar>
      <div className="heading-block">
        <h1 className="title title--md">Waiting for the village</h1>
        <p className="lede lede--sm" aria-live="polite">
          {joined} of {required} players have joined. The host starts the game when everyone is ready.
        </p>
      </div>
      <ul className="rows" aria-label="Players">
        {players.map((p) => (
          <PlayerRow key={p.id} name={p.name} ready={p.ready} isYou={p.id === myId} />
        ))}
      </ul>
      {confirming ? (
        <ConfirmSheet
          title="Leave this game?"
          body="You will go back to the start. The host will still see your name until they remove it."
          cancelLabel="Stay"
          confirmLabel="Leave"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            onLeave();
          }}
        />
      ) : null}
    </PageShell>
  );
}
