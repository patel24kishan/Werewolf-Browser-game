// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { newRoomState, type RoomState } from '@/game';
import { EndGameSheet } from '@/host/gameover/EndGameSheet';
import { GameOver } from '@/host/gameover/GameOver';
import { GameOverHost } from '@/host/gameover/GameOverHost';
import { hostOwnName, nextHostCandidates } from '@/host/gameover/candidates';
import { HostGame } from '@/host/dashboard/HostGame';
import type { Room } from '@/net';

afterEach(cleanup);

function overState(hostName: string | null, status = 'over'): RoomState {
  const base = newRoomState('host', 1);
  if (!base.ok) throw new Error('state');
  const mk = (name: string) => ({ name, ready: true, connected: true, alive: true });
  const names = ['Zed', 'Ben', 'Asha', 'Chloé', 'Dev', 'Emeka', 'Farah', 'Gus', 'Hana'];
  const players: Record<string, ReturnType<typeof mk>> = Object.fromEntries(names.map((n) => [`p-${n}`, mk(n)]));
  if (hostName) players.host = mk(hostName);
  return { ...base.state, meta: { ...base.state.meta, status }, players } as unknown as RoomState;
}

function fakeRoom() {
  const dispatch = vi.fn(async () => ({ ok: true }));
  const deleteRoom = vi.fn(async () => ({ ok: true }));
  return { room: { dispatch, deleteRoom } as unknown as Room, dispatch, deleteRoom };
}

const confirmButton = () => screen.getByRole('dialog').querySelector('.btn--primary') as HTMLElement;

describe('nextHostCandidates', () => {
  it('lists every player with a record except the host, by name', () => {
    const s = overState('Hosta');
    expect(nextHostCandidates(s).map((c) => c.name)).toEqual(['Asha', 'Ben', 'Chloé', 'Dev', 'Emeka', 'Farah', 'Gus', 'Hana', 'Zed']);
    expect(hostOwnName(s)).toBe('Hosta');
    expect(hostOwnName(overState(null))).toBeNull();
  });
});

describe('GameOver', () => {
  const candidates = [
    { id: 'b', name: 'Ben' },
    { id: 'c', name: 'Chloé' },
  ];
  function setup(hostName: string | null = 'Asha') {
    const onSetUp = vi.fn();
    const onEndSession = vi.fn();
    render(<GameOver hostId="host" hostName={hostName} candidates={candidates} busy={false} error={null} onSetUp={onSetUp} onEndSession={onEndSession} />);
    return { onSetUp, onEndSession };
  }

  it('shows Keep me first and checked, then Pass to for each candidate', () => {
    setup();
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    expect(radios.map((r) => r.closest('label')?.textContent)).toEqual(['Keep me (Asha)', 'Pass to Ben', 'Pass to Chloé']);
    expect(radios[0].checked).toBe(true);
    expect(screen.getByText(/join the next game as a player/)).toBeTruthy();
  });

  it('drops the name when the host has no player record', () => {
    setup(null);
    expect(screen.getByRole('radio', { name: 'Keep me' })).toBeTruthy();
  });

  it('sets up with the default (the host) and then the chosen id', () => {
    const { onSetUp } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Set up next game' }));
    expect(onSetUp).toHaveBeenLastCalledWith('host');
    fireEvent.click(screen.getByRole('radio', { name: 'Pass to Ben' }));
    fireEvent.click(screen.getByRole('button', { name: 'Set up next game' }));
    expect(onSetUp).toHaveBeenLastCalledWith('b');
  });

  it('ends the session only after confirming', () => {
    const { onEndSession } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'End session' }));
    expect(onEndSession).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onEndSession).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'End session' }));
    expect(screen.getByRole('dialog', { name: 'End the session for everyone?' })).toBeTruthy();
    fireEvent.click(confirmButton());
    expect(onEndSession).toHaveBeenCalledTimes(1);
  });
});

describe('GameOverHost', () => {
  it('dispatches chooseNextHost with the selected id', async () => {
    const { room, dispatch } = fakeRoom();
    render(<GameOverHost room={room} state={overState('Asha')} onEnded={vi.fn()} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Pass to Ben' }));
    fireEvent.click(screen.getByRole('button', { name: 'Set up next game' }));
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: 'chooseNextHost', newHostId: 'p-Ben' }));
  });

  it('keeping hosting passes the host id', async () => {
    const { room, dispatch } = fakeRoom();
    render(<GameOverHost room={room} state={overState('Asha')} onEnded={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Set up next game' }));
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: 'chooseNextHost', newHostId: 'host' }));
  });

  it('deletes the room only after End session is confirmed, then leaves', async () => {
    const { room, deleteRoom } = fakeRoom();
    const onEnded = vi.fn();
    render(<GameOverHost room={room} state={overState('Asha')} onEnded={onEnded} />);
    fireEvent.click(screen.getByRole('button', { name: 'End session' }));
    expect(deleteRoom).not.toHaveBeenCalled();
    fireEvent.click(confirmButton());
    await waitFor(() => expect(deleteRoom).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onEnded).toHaveBeenCalled());
  });
});

describe('End game', () => {
  it('the sheet confirms before ending', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<EndGameSheet onConfirm={onConfirm} onCancel={onCancel} />);
    expect(screen.getByText('Everyone keeps their card until the next deal.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Keep playing' }));
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'End game' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('the host dashboard dispatches endGame only after confirming', async () => {
    const { room, dispatch } = fakeRoom();
    render(<HostGame room={room} state={overState(null, 'day')} />);
    fireEvent.click(screen.getByRole('button', { name: 'End game' }));
    expect(dispatch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Keep playing' }));
    expect(dispatch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'End game' }));
    fireEvent.click(confirmButton());
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: 'endGame' }));
  });
});
