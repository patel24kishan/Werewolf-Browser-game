'use client';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createRoom, getBackend } from '@/net';
import { HelpButton } from '@/guide/HelpButton';
import { Button, PageShell, TopBar } from '@/ui/components';
import { backendErrorMessage } from '@/ui/useRoom';

/** `/`: create a session or join one. */
export function StartScreen() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const backend = getBackend();
      const hostId = await backend.signIn();
      const code = await createRoom(backend, hostId);
      router.push(`/host?code=${code}`);
    } catch (e) {
      setError(backendErrorMessage(e));
      setBusy(false);
    }
  }

  return (
    <PageShell center>
      <div style={{ width: '100%' }}>
        <TopBar>
          <HelpButton />
        </TopBar>
      </div>
      <Image className="start__art" src="/cards/card-back.png" width={230} height={230} alt="Card back: a wolf paw print on the full moon" priority />
      <div className="start__head">
        <h1 className="title title--lg">WEREWOLF</h1>
        <p className="lede">No cards tonight? Deal them to everyone&apos;s phone and play at the table.</p>
      </div>
      <div className="shell__spacer" />
      <div className="start__actions">
        {error ? (
          <p className="notice" role="alert">
            {error}
          </p>
        ) : null}
        <Button busy={busy} busyLabel="Creating…" onClick={() => void create()}>
          Create session
        </Button>
        <Button variant="secondary" onClick={() => router.push('/join')}>
          Join game
        </Button>
      </div>
      <p className="caption start__footer-note" style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
        Everyone plays in the same room. The host narrates.
      </p>
    </PageShell>
  );
}
