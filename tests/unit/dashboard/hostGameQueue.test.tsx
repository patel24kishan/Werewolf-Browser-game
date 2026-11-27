// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RoomState } from '@/game';
import { HostGame } from '@/host/dashboard/HostGame';
import type { Room } from '@/net';

// Regression: on Firebase the host's own view shows a write at once (before the
// server confirms it), so the Dawn screen appeared while "Lock in" was still in
// flight. A REVEAL tap during that window was silently dropped by the shared
// `busy` guard, leaving the host stuck on Dawn with nothing sent.

afterEach(() => cleanup());

function nightState(locked: boolean): RoomState {
  const player = (name: string) => ({ name, ready: true, connected: true, alive: true });
  return {
    meta: { hostId: 'host', hostMode: 'moderating', status: 'night', sheriffOn: false, createdAt: 1 },
    deck: { playerCount: 5, specialRoles: [] },
    players: { a: player('Asha'), b: player('Ben'), c: player('Chloe'), d: player('Dev'), f: player('Farah') },
    cards: { a: { role: 'werewolf' }, b: { role: 'seer' }, c: { role: 'villager' }, d: { role: 'villager' }, f: { role: 'villager' } },
    spares: [],
    sheriff: null,
    night: { killed: { f: true }, locked },
    events: {},
  } as unknown as RoomState;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

describe('HostGame action queue', () => {
  it('sends a REVEAL tapped while Lock in is still in flight', async () => {
    const lockWrite = deferred();
    const dispatch = vi.fn(async (action: { type: string }) => {
      if (action.type === 'confirmKills') await lockWrite.promise;
      return { ok: true as const, state: {} as RoomState };
    });
    const room = { dispatch } as unknown as Room;

    const { rerender } = render(<HostGame room={room} state={nightState(false)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Lock in 1 kill' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^Lock in$/ }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'confirmKills' });

    // Firebase shows the lock to the host immediately, before the server confirms it.
    rerender(<HostGame room={room} state={nightState(true)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reveal' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reveal' })); // impatient double tap

    await act(async () => {
      lockWrite.resolve();
      await lockWrite.promise;
    });
    await vi.waitFor(() => expect(dispatch).toHaveBeenCalledWith({ type: 'reveal' }));
    expect(dispatch.mock.calls.filter(([a]) => a.type === 'reveal')).toHaveLength(1);
  });
});
