'use client';
import { useState } from 'react';
import { Button, ConfirmSheet, PageShell } from '@/ui/components';
import type { NextHostCandidate } from './candidates';

export interface GameOverProps {
  /** The host's own player name, or null when they never joined as a player. */
  hostName: string | null;
  candidates: NextHostCandidate[];
  busy: boolean;
  error: string | null;
  /** `hostId` is the current host (the "Keep me" choice) or a candidate's id. */
  onSetUp: (newHostId: string) => void;
  onEndSession: () => void;
  hostId: string;
}

/** Host only: "Another round?" with who hosts next, set up next game, or end the session. */
export function GameOver({ hostName, candidates, busy, error, onSetUp, onEndSession, hostId }: GameOverProps) {
  const [chosen, setChosen] = useState(hostId);
  const [ending, setEnding] = useState(false);
  const options = [{ id: hostId, label: hostName ? `Keep me (${hostName})` : 'Keep me' }, ...candidates.map((c) => ({ id: c.id, label: `Pass to ${c.name}` }))];

  return (
    <PageShell
      footer={
        <>
          <Button busy={busy} busyLabel="One moment…" onClick={() => onSetUp(chosen)}>
            Set up next game
          </Button>
          <button type="button" className="textbtn" disabled={busy} onClick={() => setEnding(true)}>
            End session
          </button>
        </>
      }
    >
      <div className="dash__head">
        <p className="dash__eyebrow">Game over</p>
        <h1 className="title title--md">Another round?</h1>
        <p className="lede lede--sm">Same lobby, fresh shuffle. First: is the host changing?</p>
      </div>
      {error ? (
        <p className="notice" role="alert">
          {error}
        </p>
      ) : null}
      <fieldset className="fieldset">
        <legend className="fieldset__legend">Who hosts the next game?</legend>
        {options.map((o) => (
          <label key={o.id} className={chosen === o.id ? 'pick pick--on' : 'pick'}>
            <input type="radio" name="nexthost" value={o.id} checked={chosen === o.id} onChange={() => setChosen(o.id)} />
            <span className="pick__name">{o.label}</span>
          </label>
        ))}
      </fieldset>
      <p className="notice notice--calm">Pass hosting to someone else and you&apos;ll join the next game as a player. The new host sets up the game.</p>
      {ending ? (
        <ConfirmSheet
          title="End the session for everyone?"
          cancelLabel="Cancel"
          confirmLabel="End session"
          onCancel={() => setEnding(false)}
          onConfirm={() => {
            setEnding(false);
            onEndSession();
          }}
        />
      ) : null}
    </PageShell>
  );
}
