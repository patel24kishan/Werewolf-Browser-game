'use client';
import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import type { HostMode } from '@/game';
import { joinUrl } from '@/net';
import { HelpButton } from '@/guide/HelpButton';
import { Button, PageShell, TextField, TopBar } from '@/ui/components';

export interface SessionStepProps {
  code: string;
  origin: string;
  hostMode: HostMode;
  /** True when the host already has a player record (a name). */
  hostHasName: boolean;
  onHostMode: (mode: HostMode) => void;
  /** Called with the typed name; resolves with an error message, or null to go on. */
  onNext: (name: string) => Promise<string | null>;
  onBack: () => void;
}

/** Step 1: the code, the QR, sharing, and Moderating / Playing. */
export function SessionStep({ code, origin, hostMode, hostHasName, onHostMode, onNext, onBack }: SessionStepProps) {
  const url = joinUrl(code, origin);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const needsName = hostMode === 'playing' && !hostHasName;

  async function share() {
    setShareNote(null);
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({
          title: 'Werewolf',
          text: `Join my Werewolf game: ${code}`,
          url,
        });
        return;
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return; // the host closed the share sheet
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareNote('Link copied');
    } catch {
      setShareNote(`Couldn't copy. Share this link by hand: ${url}`);
    }
  }

  async function next() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      setError(await onNext(name));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell
      footer={
        <Button busy={busy} busyLabel="One moment…" onClick={() => void next()}>
          Next: choose players &amp; cards
        </Button>
      }
    >
      <TopBar onBack={onBack}>
        <span className="topbar__end">
          <span className="step-label">You are the host</span>
          <HelpButton />
        </span>
      </TopBar>
      <div className="panel">
        <p className="lede lede--sm">Players join with this code</p>
        <p className="code-big" aria-label={`Game code ${code.split('').join(' ')}`}>
          {code}
        </p>
        <div className="qr" role="img" aria-label={`QR code to join game ${code}`}>
          <QRCodeSVG value={url} size={150} level="M" bgColor="transparent" fgColor="currentColor" />
        </div>
        <button type="button" className="btn btn--small" onClick={() => void share()}>
          Share invite link
        </button>
        <p className="caption center" role="status" style={{ overflowWrap: 'anywhere' }}>
          {shareNote}
        </p>
      </div>
      <fieldset className="fieldset">
        <legend className="fieldset__legend">This game, I am…</legend>
        <div className="choice-grid">
          {(
            [
              ['moderating', 'Moderating', 'No card. I see every role and narrate.'],
              ['playing', 'Playing', 'I get a card like everyone else.'],
            ] as const
          ).map(([value, title, text]) => (
            <label key={value} className={hostMode === value ? 'choice choice--on' : 'choice'}>
              <span className="choice__head">
                <input type="radio" name="hostmode" value={value} checked={hostMode === value} onChange={() => onHostMode(value)} />
                {title}
              </span>
              <span className="choice__text">{text}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {needsName ? (
        <TextField
          label="Your name"
          value={name}
          autoComplete="off"
          error={error}
          helper="Shown to the other players."
          onChange={(e) => setName(e.target.value)}
        />
      ) : error ? (
        <p className="notice" role="alert">
          {error}
        </p>
      ) : null}
    </PageShell>
  );
}
