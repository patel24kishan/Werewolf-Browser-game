'use client';
import type { SpecialRoleId } from '@/game';
import { Button, CheckIcon, PageShell, TopBar } from '@/ui/components';
import { reviewDeck } from '../deckInfo';

export interface ReviewStepProps {
  playerCount: number;
  specialRoles: readonly SpecialRoleId[];
  onEdit: () => void;
  onConfirm: () => void;
}

/** Step 3 of 3: the cards that will be dealt. */
export function ReviewStep({ playerCount, specialRoles, onEdit, onConfirm }: ReviewStepProps) {
  const review = reviewDeck(playerCount, specialRoles);
  return (
    <PageShell
      footer={
        <div className="btn-pair">
          <Button variant="surface" style={{ height: 60 }} onClick={onEdit}>
            Edit
          </Button>
          <Button disabled={!review.ok} onClick={onConfirm} style={{ fontSize: 16 }}>
            Looks good
          </Button>
        </div>
      }
    >
      <TopBar onBack={onEdit}>
        <span className="step-label">Step 3 of 3</span>
      </TopBar>
      <div className="heading-block">
        <h1 className="title title--md">Review the deck</h1>
        <p className="lede lede--sm">These cards will be shuffled and dealt.</p>
      </div>
      {review.ok ? (
        <>
          <ul className="rows" aria-label="Deck">
            {review.rows.map((r) => (
              <li key={r.role} className="deck-row">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/cards/${r.art}`} alt="" />
                <span className="deck-row__name">{r.name}</span>
                <span className="deck-row__count">× {r.count}</span>
              </li>
            ))}
          </ul>
          <p className="summary" role="status">
            <CheckIcon />
            {review.summary}
          </p>
        </>
      ) : (
        <p className="notice" role="alert">
          {review.message}
        </p>
      )}
    </PageShell>
  );
}
