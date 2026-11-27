'use client';
import { MAX_PLAYERS, MIN_PLAYERS, SPECIAL_ROLE_IDS, getRole, type SpecialRoleId } from '@/game';
import { Button, PageShell, TopBar } from '@/ui/components';
import { reviewDeck, rulebookHint } from '../deckInfo';

export interface RolesStepProps {
  code: string;
  playerCount: number;
  specialRoles: readonly SpecialRoleId[];
  sheriffOn: boolean;
  /** Error from the last "Next" (the reducer refused). */
  error: string | null;
  busy: boolean;
  onPlayerCount: (n: number) => void;
  onToggleRole: (role: SpecialRoleId) => void;
  onSheriff: (on: boolean) => void;
  onNext: () => void;
  onBack: () => void;
}

/** Steps 1–2 of 3: player count, special roles and the Sheriff switch. */
export function RolesStep({ code, playerCount, specialRoles, sheriffOn, error, busy, onPlayerCount, onToggleRole, onSheriff, onNext, onBack }: RolesStepProps) {
  const hint = rulebookHint(playerCount);
  const review = reviewDeck(playerCount, specialRoles);
  const problem = review.ok ? null : review.message;
  return (
    <PageShell
      footer={
        <Button busy={busy} busyLabel="Saving…" onClick={onNext}>
          Next: review deck
        </Button>
      }
    >
      <TopBar onBack={onBack}>
        <span className="step-label">Step 1–2 of 3</span>
        <span className="topbar__label">
          Game <b>{code}</b>
        </span>
      </TopBar>
      <section className="section" aria-labelledby="count-h">
        <h1 id="count-h" className="section-title">
          Number of players
        </h1>
        <div className="stepper">
          <button
            type="button"
            className="stepper__btn"
            aria-label="Fewer players"
            disabled={playerCount <= MIN_PLAYERS}
            onClick={() => onPlayerCount(playerCount - 1)}
          >
            −
          </button>
          <span className="stepper__value" data-testid="player-count" aria-live="polite">
            {playerCount}
          </span>
          <button
            type="button"
            className="stepper__btn"
            aria-label="More players"
            disabled={playerCount >= MAX_PLAYERS}
            onClick={() => onPlayerCount(playerCount + 1)}
          >
            +
          </button>
        </div>
        {hint ? (
          <p className="hint">
            From the rulebook for {playerCount} players: <b>{hint.werewolves}</b>, <b>{hint.seer}</b>, the rest Villagers.
          </p>
        ) : null}
      </section>
      <section className="section" aria-labelledby="roles-h">
        <h2 id="roles-h" className="section-title">
          Special roles
        </h2>
        <p className="caption">Each one replaces a Villager.</p>
        <div className="tile-grid">
          {SPECIAL_ROLE_IDS.map((id) => {
            const role = getRole(id);
            return (
              <button key={id} type="button" className="tile" aria-pressed={specialRoles.includes(id)} onClick={() => onToggleRole(id)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/cards/${role.art}`} alt="" />
                <span className="tile__label">
                  <span className="tile__check" data-checked={specialRoles.includes(id)} aria-hidden="true">
                    {specialRoles.includes(id) ? (
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M5 12l5 5L20 7" />
                      </svg>
                    ) : null}
                  </span>
                  {role.name}
                </span>
              </button>
            );
          })}
        </div>
        <button type="button" role="switch" aria-checked={sheriffOn} className="switch-row" onClick={() => onSheriff(!sheriffOn)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/cards/${getRole('sheriff').art}`} alt="" />
          <span className="switch-row__text">
            <span className="switch-row__title">Elect a Sheriff</span>
            <span className="switch-row__sub">Optional. Not dealt; the table votes after the deal.</span>
          </span>
          <span className="switch" aria-hidden="true" />
        </button>
        {problem || error ? (
          <p className="notice" role="alert">
            {problem ?? error}
          </p>
        ) : null}
      </section>
    </PageShell>
  );
}
