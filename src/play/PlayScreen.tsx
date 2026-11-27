'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { countedPlayerIds } from '@/game';
import { isRoomCode } from '@/net';
import { Button, PageShell } from '@/ui/components';
import { useRoom } from '@/ui/useRoom';
import { PlayerView } from './PlayerView';
import { PlayerLobby, type LobbyPlayer } from './PlayerLobby';

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

/** `/play?code=XXXX`: a view that switches on the room's status (later features add the card). */
export function PlayScreen() {
  const params = useSearchParams();
  const router = useRouter();
  const raw = (params.get('code') ?? '').toUpperCase();
  const code = isRoomCode(raw) ? raw : null;
  const { room, view, error } = useRoom(code);

  const state = view?.state ?? null;
  const missingMe = view !== null && view.loaded && state !== null && !(view.myId in state.players);

  useEffect(() => {
    if (missingMe && code) router.replace(`/join?code=${code}`);
  }, [missingMe, code, router]);

  // Hosting was passed to this phone: it moves to the host view.
  const nowHost = view !== null && view.loaded && state !== null && view.isHost;
  useEffect(() => {
    if (nowHost && code) router.replace(`/host?code=${code}`);
  }, [nowHost, code, router]);

  const toStart = () => router.push('/');

  if (code === null) return <Message title="That's not a game code" onStart={toStart} />;
  if (error) return <Message title="Can't connect" body={error} onStart={toStart} />;
  if (!room || !view || !view.loaded) return <Message title="Connecting…" onStart={toStart} />;
  if (!state) return <Message title="That game is gone" body={`There is no game with code ${code} any more.`} onStart={toStart} />;
  if (nowHost) return <Message title="Opening your game…" onStart={toStart} />;
  if (missingMe) return <Message title="Joining…" onStart={toStart} />;

  if (state.meta.status === 'lobby') {
    const players: LobbyPlayer[] = Object.entries(state.players)
      .map(([id, p]) => ({ id, name: p.name, ready: p.ready }))
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    return (
      <PlayerLobby
        code={code}
        players={players}
        myId={view.myId}
        required={state.deck.playerCount}
        joined={countedPlayerIds(state).length}
        onSetReady={(ready) => void room.dispatch({ type: 'setReady', ready })}
        onLeave={toStart}
      />
    );
  }

  // Only this player's own card is ever read.
  const myCard = Object.hasOwn(state.cards, view.myId) ? state.cards[view.myId] : undefined;
  if (!myCard) return <Message title="You're not in this round" body="Ask the host to add you next game." onStart={toStart} />;
  const me = state.players[view.myId];
  const event = Object.hasOwn(state.events, view.myId) ? state.events[view.myId] : undefined;
  return (
    <PlayerView
      name={me.name}
      code={code}
      role={myCard.role}
      playerId={view.myId}
      alive={me.alive}
      killedAt={event?.killedAt}
      isSheriff={state.sheriff === view.myId}
      notice={state.meta.status === 'over' ? 'Game over. The host is setting up the next game.' : undefined}
    />
  );
}
