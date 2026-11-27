'use client';
import { useState } from 'react';
import { HelpButton } from '@/guide/HelpButton';
import { Button, PageShell, TextField, TopBar } from '@/ui/components';
import { normalizeCodeInput, validateCodeInput } from './codeInput';

/** Outcome of looking for a game: ok, or the message to show under the field. */
export type RoomCheck = { readonly ok: true } | { readonly ok: false; readonly message: string };

export interface CodeStepProps {
  initialCode?: string;
  /** Looks the game up (exists and still in the lobby). */
  checkRoom: (code: string) => Promise<RoomCheck>;
  onContinue: (code: string) => void;
  onScan: () => void;
  onBack: () => void;
}

/** "Join a game": one code input, Continue, and a way to scan the host's QR code. */
export function CodeStep({ initialCode = '', checkRoom, onContinue, onScan, onBack }: CodeStepProps) {
  const [value, setValue] = useState(initialCode);
  const [error, setError] = useState<string | null>(() => {
    if (initialCode === '') return null;
    const first = validateCodeInput(initialCode);
    return first.ok ? null : first.message;
  });
  const [busy, setBusy] = useState(false);

  function validateOnBlur() {
    if (value.trim() === '') return; // Empty is only an error on submit.
    const result = validateCodeInput(value);
    setError(result.ok ? null : result.message);
  }

  async function submit() {
    if (busy) return;
    const result = validateCodeInput(value);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const check = await checkRoom(result.code);
      if (check.ok) onContinue(result.code);
      else setError(check.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell
      footer={
        <Button type="submit" form="join-code-form" busy={busy} busyLabel="Checking…">
          Continue
        </Button>
      }
    >
      <TopBar onBack={onBack}>
        <HelpButton />
      </TopBar>
      <form
        id="join-code-form"
        noValidate
        style={{ display: 'flex', flexDirection: 'column', gap: 24 }}
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="heading-block heading-block--spaced">
          <h1 className="title">Join a game</h1>
          <p className="lede">Ask the host for the game code on their screen.</p>
        </div>
        <TextField
          code
          label="Game code"
          value={value}
          error={error}
          maxLength={4}
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          inputMode="text"
          onChange={(event) => {
            setValue(normalizeCodeInput(event.target.value));
            setError(null);
          }}
          onBlur={validateOnBlur}
        />
        <div className="divider">or</div>
        <Button variant="surface" onClick={onScan}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
            <path d="M7 12h10" />
          </svg>
          Scan the host&apos;s QR code
        </Button>
      </form>
    </PageShell>
  );
}
