'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { type HostMode, type PlayerId, type SpecialRoleId } from '@/game';
import { joinErrorMessage } from '@/join/joinErrors';
import { isRoomCode } from '@/net';
import { PlayerView } from '@/play/PlayerView';
import { Button, PageShell } from '@/ui/components';
import { useRoom } from '@/ui/useRoom';
import { EndGameSheet } from './gameover/EndGameSheet';
import { GameOverHost } from './gameover/GameOverHost';
import { HostGame } from './dashboard/HostGame';
import { SheriffHost } from './sheriff/SheriffHost';
import { clearStepDone } from './sheriff/sheriffStep';
import { clampCount, reviewDeck } from './deckInfo';
import { LobbyStep } from './steps/LobbyStep';
import { ReviewStep } from './steps/ReviewStep';
import { RolesStep } from './steps/RolesStep';
import { SessionStep } from './steps/SessionStep';

type Step = 'session' | 'roles' | 'review' | 'lobby';

function Message({ title, body, onStart }: { title: string; body?: string; onStart: () => void }) {
  return (
    <PageShell footer={<Button onClick={onStart}>Back to start</Button>}>
      <div className="heading-block heading-block--spaced" role="status">
        <h1 className="title">{title}</h1>
        {body ? <p className="lede">{body}</p> : null}
      </div>
    </PageShell>
  );
}

/** `/host?code=XXXX`: the host's view, switching on the room's status. */
export function HostScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const raw = (params.get('code') ?? '').toUpperCase();
  const code = isRoomCode(raw) ? raw : null;
  const { room, view, error } = useRoom(code);
  const state = view?.state ?? null;

  const [step, setStep] = useState<Step>('session');
  const [draft, setDraft] = useState<{
    count?: number;
    specials?: SpecialRoleId[];
    sheriff?: boolean;
  }>({});
  const [busy, setBusy] = useState(false);
  const [rolesError, setRolesError] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [endOpen, setEndOpen] = useState(false);

  const notHost = view !== null && view.loaded && state !== null && !view.isHost;
  useEffect(() => {
    if (notHost && code) router.replace(`/play?code=${code}`);
  }, [notHost, code, router]);

  const inLobby = state?.meta.status === 'lobby';
  useEffect(() => {
    if (inLobby && code) clearStepDone(code);
  }, [inLobby, code]);

  // After "Keep me": the same lobby, back at step 1.
  const isOver = state?.meta.status === 'over';
  const [wasOver, setWasOver] = useState(false);
  if (isOver !== wasOver) {
    setWasOver(isOver);
    if (isOver) {
      setStep('session');
      setDraft({});
    }
  }

  const toStart = () => router.push('/');

  if (code === null) return <Message title="That's not a game code" onStart={toStart} />;
  if (error) return <Message title="Can't connect" body={error} onStart={toStart} />;
  if (!room || !view || !view.loaded) return <Message title="Connecting…" onStart={toStart} />;
  if (!state) return <Message title="That game is gone" body={`There is no game with code ${code} any more.`} onStart={toStart} />;
  if (notHost) return <Message title="Opening your game…" onStart={toStart} />;

  if (state.meta.status === 'over') return <GameOverHost room={room} state={state} onEnded={toStart} />;
  if (state.meta.status !== 'lobby' && state.meta.hostMode === 'playing') {
    const myCard = Object.hasOwn(state.cards, view.myId) ? state.cards[view.myId] : undefined;
    const me = Object.hasOwn(state.players, view.myId) ? state.players[view.myId] : undefined;
    if (!myCard || !me) return <Message title="You're not in this round" body="Add yourself as a player next game." onStart={toStart} />;
    const killedAt = Object.hasOwn(state.events, view.myId) ? state.events[view.myId].killedAt : undefined;
    return (
      <SheriffHost room={room} state={state} code={code}>
        {(openSheriff) => (
          <>
            <PlayerView
              name={me.name}
              code={code}
              role={myCard.role}
              playerId={view.myId}
              alive={me.alive}
              killedAt={killedAt}
              isSheriff={state.sheriff === view.myId}
              actions={[...(openSheriff ? [{ label: 'Sheriff', onClick: openSheriff }] : []), { label: 'End game', onClick: () => setEndOpen(true) }]}
            />
            {endOpen ? (
              <EndGameSheet
                onCancel={() => setEndOpen(false)}
                onConfirm={() => {
                  setEndOpen(false);
                  void room.dispatch({ type: 'endGame' });
                }}
              />
            ) : null}
          </>
        )}
      </SheriffHost>
    );
  }
  if (state.meta.status !== 'lobby') {
    return (
      <SheriffHost room={room} state={state} code={code}>
        {(openSheriff) => <HostGame room={room} state={state} onOpenSheriff={openSheriff} />}
      </SheriffHost>
    );
  }

  const playerCount = draft.count ?? state.deck.playerCount;
  const specialRoles = draft.specials ?? [...state.deck.specialRoles];
  const sheriffOn = draft.sheriff ?? state.meta.sheriffOn;
  const hostHasName = Object.hasOwn(state.players, state.meta.hostId);

  async function sessionNext(name: string): Promise<string | null> {
    if (!room || !state) return null;
    if (state.meta.hostMode === 'playing' && !hostHasName) {
      const result = await room.dispatch({ type: 'join', name });
      if (!result.ok && result.error.code !== 'already-joined') return joinErrorMessage(result.error, code ?? '');
    }
    setStep('roles');
    return null;
  }

  async function rolesNext() {
    if (!room || busy || !reviewDeck(playerCount, specialRoles).ok) return;
    setBusy(true);
    setRolesError(null);
    try {
      const result = await room.dispatch({
        type: 'configureDeck',
        playerCount,
        specialRoles,
        sheriffOn,
      });
      if (result.ok) setStep('review');
      else setRolesError("Couldn't save the deck. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    if (!room || busy) return;
    setBusy(true);
    setStartError(null);
    try {
      const result = await room.dispatch({ type: 'deal' });
      if (!result.ok) setStartError(result.error.code === 'start-rule-failed' ? 'Not everyone is ready yet.' : "Couldn't deal the cards. Try again.");
    } finally {
      setBusy(false);
    }
  }

  switch (step) {
    case 'session':
      return (
        <SessionStep
          code={code}
          origin={window.location.origin}
          hostMode={state.meta.hostMode}
          hostHasName={hostHasName}
          onHostMode={(hostMode: HostMode) => void room.dispatch({ type: 'setHostMode', hostMode })}
          onNext={sessionNext}
          onBack={toStart}
        />
      );
    case 'roles':
      return (
        <RolesStep
          code={code}
          playerCount={playerCount}
          specialRoles={specialRoles}
          sheriffOn={sheriffOn}
          error={rolesError}
          busy={busy}
          onPlayerCount={(n) => setDraft({ ...draft, count: clampCount(n) })}
          onToggleRole={(role) =>
            setDraft({
              ...draft,
              specials: specialRoles.includes(role) ? specialRoles.filter((r) => r !== role) : [...specialRoles, role],
            })
          }
          onSheriff={(on) => setDraft({ ...draft, sheriff: on })}
          onNext={() => void rolesNext()}
          onBack={() => setStep('session')}
        />
      );
    case 'review':
      return (
        <ReviewStep
          playerCount={state.deck.playerCount}
          specialRoles={state.deck.specialRoles}
          onEdit={() => setStep('roles')}
          onConfirm={() => setStep('lobby')}
        />
      );
    case 'lobby':
      return (
        <LobbyStep
          code={code}
          state={state}
          myId={view.myId as PlayerId}
          busy={busy}
          error={startError}
          onRemove={(playerId) => void room.dispatch({ type: 'removePlayer', playerId })}
          onStart={() => void start()}
          onBack={() => setStep('review')}
        />
      );
  }
}
