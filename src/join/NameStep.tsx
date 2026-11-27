'use client';
import { useState } from 'react';
import { Button, PageShell, TextField, TopBar } from '@/ui/components';

/** Outcome of trying to join: ok, or a plain-words message for the field. */
export type JoinResult = { readonly ok: true } | { readonly ok: false; readonly message: string };

export interface NameStepProps {
  code: string;
  /** Sends the join; resolves with the outcome. */
  onJoin: (name: string) => Promise<JoinResult>;
  onBack: () => void;
  /** Disables the form (e.g. while the game is still loading). */
  disabled?: boolean;
  /** A problem with the game itself (missing, already started), shown above the field. */
  notice?: string | null;
}

/** "What's your name?": one input and "Join the village". */
export function NameStep({ code, onJoin, onBack, disabled = false, notice = null }: NameStepProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy || disabled) return;
    setBusy(true);
    setError(null);
    try {
      const result = await onJoin(name);
      if (!result.ok) setError(result.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell
      footer={
        <Button type="submit" form="join-name-form" busy={busy} busyLabel="Joining…" disabled={disabled}>
          Join the village
        </Button>
      }
    >
      <TopBar onBack={onBack}>
        <span className="pill" aria-label={`Game code ${code}`}>
          {code}
        </span>
      </TopBar>
      <form
        id="join-name-form"
        noValidate
        style={{ display: 'flex', flexDirection: 'column', gap: 24 }}
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="heading-block heading-block--spaced">
          <h1 className="title">What&apos;s your name?</h1>
          <p className="lede">This is how the host and the table will see you.</p>
        </div>
        {notice ? (
          <p className="notice" role="alert">
            {notice}
          </p>
        ) : null}
        <TextField
          label="Your name"
          helper="Up to 12 characters. No sign-up needed."
          value={name}
          error={error}
          autoComplete="nickname"
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
        />
      </form>
    </PageShell>
  );
}
