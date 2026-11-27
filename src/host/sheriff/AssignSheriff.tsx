'use client';
import { useState } from 'react';
import { lookupRole } from '@/card/RoleCard';
import { Button, PageShell, TopBar } from '@/ui/components';

export interface SheriffCandidate {
  id: string;
  name: string;
}

export interface AssignSheriffProps {
  /** Living dealt players only. Names only: no roles are shown here. */
  players: SheriffCandidate[];
  busy: boolean;
  error: string | null;
  onAssign: (playerId: string) => void;
  onSkip: () => void;
  /** Present when opened from the dashboard or card screen. */
  onBack?: () => void;
  /** Small label above the title. */
  eyebrow?: string;
}

/** "Who's the Sheriff?": pick a living player, or skip. Host only. */
export function AssignSheriff({ players, busy, error, onAssign, onSkip, onBack, eyebrow = 'After the deal' }: AssignSheriffProps) {
  const [chosen, setChosen] = useState<string | null>(null);
  const art = lookupRole('sheriff').art;
  const chosenName = players.find((p) => p.id === chosen)?.name;

  return (
    <PageShell
      footer={
        <>
          <p className="caption center">Optional. The Sheriff&apos;s vote counts twice. If they die, move the card to their chosen successor here.</p>
          <Button disabled={chosen === null || !chosenName} busy={busy} busyLabel="Giving the card…" onClick={() => chosen && onAssign(chosen)}>
            {chosenName ? `Give the Sheriff card to ${chosenName}` : 'Give the Sheriff card'}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={onSkip}>
            Skip, no Sheriff this game
          </Button>
        </>
      }
    >
      <TopBar onBack={onBack}>
        <span className="dash__eyebrow">{eyebrow}</span>
      </TopBar>
      <div className="sheriff-head">
        {art ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="sheriff-head__art" src={`/cards/${art}`} alt="Sheriff card: a gold star badge on a ribbon" />
        ) : null}
        <div className="sheriff-head__text">
          <h1 className="title title--md">Who&apos;s the Sheriff?</h1>
          <p className="lede lede--sm">Ask the table out loud, then tap the player the village chose.</p>
        </div>
      </div>
      {error ? (
        <p className="notice" role="alert">
          {error}
        </p>
      ) : null}
      <fieldset className="fieldset">
        <legend className="fieldset__legend">Players</legend>
        {players.map((p) => (
          <label key={p.id} className={chosen === p.id ? 'pick pick--on' : 'pick'}>
            <input type="radio" name="sheriff" value={p.id} checked={chosen === p.id} onChange={() => setChosen(p.id)} />
            <span className="pick__name">{p.name}</span>
          </label>
        ))}
      </fieldset>
    </PageShell>
  );
}
