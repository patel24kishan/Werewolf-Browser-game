'use client';
import { useState } from 'react';
import { Button, PageShell } from '@/ui/components';
import { CardOverlay } from './CardOverlay';
import { ConfirmKillsSheet } from './ConfirmKillsSheet';
import { lockLabel, type DashPlayer, type DashStatus } from './types';

export interface DashboardProps {
  status: DashStatus;
  players: DashPlayer[];
  busy: boolean;
  error: string | null;
  /** Opens the Assign Sheriff screen. Absent when the Sheriff is switched off. */
  onSheriff?: () => void;
  /** Opens the "End game?" confirmation. */
  onEndGame?: () => void;
  onToggleKilled: (playerId: string) => void;
  onNightFalls: () => void;
  onLockIn: () => void;
}

const TITLES: Record<DashStatus, string> = {
  dealt: 'Cards dealt',
  night: 'Night',
  day: 'Day',
};

/** Host dashboard: the player list, Killed toggles (unlocked night only), card overlay and the primary button. */
export function Dashboard({ status, players, busy, error, onSheriff, onEndGame, onToggleKilled, onNightFalls, onLockIn }: DashboardProps) {
  const [open, setOpen] = useState<{ id: string; opener: HTMLElement } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const night = status === 'night';
  const victims = players.filter((p) => p.alive && p.killed);
  const sheriffDead = players.some((p) => p.sheriff && !p.alive);
  const openPlayer = open ? players.find((p) => p.id === open.id) : undefined;

  return (
    <PageShell
      footer={
        <>
          {night ? (
            <Button variant="danger" onClick={() => setConfirming(true)}>
              {lockLabel(victims.length)}
            </Button>
          ) : (
            <Button busy={busy} busyLabel="Starting…" onClick={onNightFalls}>
              Night falls
            </Button>
          )}
          {onEndGame ? (
            <Button variant="secondary" disabled={busy} onClick={onEndGame}>
              End game
            </Button>
          ) : null}
        </>
      }
    >
      <div className="dash__head dash__head--row">
        <div className="dash__head">
          <p className="dash__eyebrow">Host dashboard</p>
          <h1 className="dash__title">{TITLES[status]}</h1>
        </div>
        {onSheriff ? (
          <button type="button" className="btn btn--small" onClick={onSheriff}>
            Sheriff
          </button>
        ) : null}
      </div>
      {onSheriff && sheriffDead ? (
        <div className="notice notice--sheriff" role="status">
          <p>The Sheriff died. Ask them to name a successor.</p>
          <button type="button" className="btn btn--small" onClick={onSheriff}>
            Choose the new Sheriff
          </button>
        </div>
      ) : null}
      <p className="hint">
        Tap a name to see their card.
        {night ? (
          <>
            {' '}
            Switch on <b className="hint__danger">Killed</b> for tonight&apos;s victims.
          </>
        ) : null}
      </p>
      {error ? (
        <p className="notice" role="alert">
          {error}
        </p>
      ) : null}
      <ul className="rows rows--tight" aria-label="Players">
        {players.map((p) => {
          const canToggle = night && p.alive;
          const killed = p.alive && p.killed;
          return (
            <li key={p.id} className={!p.alive ? 'drow drow--dead' : killed ? 'drow drow--killed' : 'drow'}>
              <button type="button" className="drow__name" aria-haspopup="dialog" onClick={(e) => setOpen({ id: p.id, opener: e.currentTarget })}>
                <span className="drow__label">{p.name}</span>
                {p.sheriff ? (
                  <span className="drow__badge">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M12 2l3 6.6 7.2.8-5.4 4.9 1.5 7.1L12 17.8 5.7 21.4l1.5-7.1L1.8 9.4l7.2-.8z" />
                    </svg>
                    Sheriff
                  </span>
                ) : null}
                {p.alive ? null : <span className="drow__dead">Dead</span>}
              </button>
              <label className={killed ? 'ktoggle ktoggle--on' : canToggle ? 'ktoggle' : 'ktoggle ktoggle--off'}>
                <input type="checkbox" aria-label={`Killed: ${p.name}`} checked={killed} disabled={!canToggle} onChange={() => onToggleKilled(p.id)} />
                Killed
              </label>
            </li>
          );
        })}
      </ul>
      {open && openPlayer ? <CardOverlay name={openPlayer.name} role={openPlayer.role} returnTo={open.opener} onClose={() => setOpen(null)} /> : null}
      {confirming && night ? (
        <ConfirmKillsSheet victims={victims} busy={busy} onUndo={onToggleKilled} onCancel={() => setConfirming(false)} onConfirm={onLockIn} />
      ) : null}
    </PageShell>
  );
}
