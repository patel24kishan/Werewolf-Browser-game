'use client';
import { useState, useSyncExternalStore } from 'react';
import { lookupRole } from '@/card/RoleCard';
import { PageShell } from '@/ui/components';
import { CardScreen, type CardScreenProps } from './CardScreen';

/** The Sheriff's own screen: the Sheriff card, with a tile that flips to the secret role card. */
export function SheriffScreen(props: CardScreenProps) {
  const [showRole, setShowRole] = useState(false);
  // False during server render and hydration, true after: the live region fills in after mount.
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  const art = lookupRole('sheriff').art;

  if (showRole) {
    return <CardScreen {...props} actions={[...(props.actions ?? []), { label: 'Sheriff card', onClick: () => setShowRole(false) }]} />;
  }
  return (
    <PageShell
      footer={
        <button type="button" className="roletile" onClick={() => setShowRole(true)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/cards/card-back.png" alt="" draggable={false} width={44} height={44} />
          <span>
            Your secret role card
            <span className="roletile__sub">Still yours. Tap to flip it.</span>
          </span>
        </button>
      }
    >
      <div className="topbar">
        <span className="cardscreen__name">{props.name}</span>
        <span className="topbar__label">
          Game <b>{props.code}</b>
        </span>
      </div>
      {props.notice ? (
        <p className="notice notice--calm" role="status">
          {props.notice}
        </p>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {mounted ? "You're the Sheriff" : ''}
      </p>
      <div className="sheriff-screen">
        <h1 className="title center">You&apos;re the Sheriff</h1>
        {art ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="sheriff-screen__art" src={`/cards/${art}`} alt="Sheriff card" draggable={false} />
        ) : null}
        <p className="sheriff-screen__text">The village chose you. Your vote counts twice. If you die, name your successor.</p>
        {props.actions?.map((a) => (
          <button key={a.label} type="button" className="textbtn" onClick={a.onClick}>
            {a.label}
          </button>
        ))}
      </div>
    </PageShell>
  );
}
