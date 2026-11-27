'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { isRoomCode } from '@/net';
import { useRoom } from '@/ui/useRoom';
import { CodeStep } from './CodeStep';
import { NameStep, type JoinResult } from './NameStep';
import { ScanStep } from './ScanStep';
import { checkRoom, joinBlocker } from './checkRoom';
import { joinErrorMessage } from './joinErrors';

type Step = 'code' | 'scan' | 'name';

/** The `/join` page: code (or scan), then name, then on to `/play`. */
export function JoinFlow() {
  const params = useSearchParams();
  const fromUrl = (params.get('code') ?? '').toUpperCase();
  const urlCodeValid = isRoomCode(fromUrl);
  const [step, setStep] = useState<Step>(urlCodeValid ? 'name' : 'code');
  const [code, setCode] = useState(urlCodeValid ? fromUrl : '');
  const router = useRouter();

  if (step === 'scan') {
    return (
      <ScanStep
        onCode={(scanned) => {
          setCode(scanned);
          setStep('name');
        }}
        onBack={() => setStep('code')}
      />
    );
  }

  if (step === 'name') {
    return <NameScreen code={code} onBack={() => setStep('code')} onJoined={() => router.push(`/play?code=${code}`)} />;
  }

  return (
    <CodeStep
      initialCode={code || fromUrl.slice(0, 4)}
      checkRoom={checkRoom}
      onContinue={(valid) => {
        setCode(valid);
        setStep('name');
      }}
      onScan={() => setStep('scan')}
      onBack={() => router.push('/')}
    />
  );
}

function NameScreen({ code, onBack, onJoined }: { code: string; onBack: () => void; onJoined: () => void }) {
  const { room, view, error } = useRoom(code);
  let notice = error;
  if (!notice && view?.loaded && !(view.state && view.myId in view.state.players)) {
    notice = joinBlocker(code, view.exists, view.state?.meta.status);
  }

  async function onJoin(name: string): Promise<JoinResult> {
    if (!room) return { ok: false, message: 'Still connecting. Try again in a moment.' };
    const result = await room.dispatch({ type: 'join', name });
    if (result.ok || result.error.code === 'already-joined') {
      onJoined();
      return { ok: true };
    }
    return { ok: false, message: joinErrorMessage(result.error, code) };
  }

  return <NameStep code={code} onBack={onBack} onJoin={onJoin} disabled={notice !== null} notice={notice} />;
}
