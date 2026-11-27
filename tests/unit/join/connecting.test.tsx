// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UseRoomResult } from '@/ui/useRoom';

// Regression: on a real backend, signing in and loading the room takes about a
// second. Tapping "Join the village" before that used to fail with "Still
// connecting. Try again in a moment." instead of waiting.
let current: UseRoomResult = { room: null, view: null, error: null };
vi.mock('@/ui/useRoom', () => ({ useRoom: () => current }));

const { NameScreen } = await import('@/join/JoinFlow');

afterEach(() => {
  cleanup();
  current = { room: null, view: null, error: null };
});

function loadedRoom(dispatch: ReturnType<typeof vi.fn>): UseRoomResult {
  const view = {
    code: 'K7QX',
    myId: 'me',
    loaded: true,
    exists: true,
    isHost: false,
    state: { meta: { hostId: 'host', hostMode: 'moderating', status: 'lobby', sheriffOn: true, createdAt: 1 }, players: {} },
  };
  const room = { dispatch, whenLoaded: () => Promise.resolve(), getView: () => view } as unknown as UseRoomResult['room'];
  return { room, view: view as unknown as UseRoomResult['view'], error: null };
}

describe('NameScreen while connecting', () => {
  it('disables Join and says Connecting… before the room is open', () => {
    render(<NameScreen code="K7QX" onBack={vi.fn()} onJoined={vi.fn()} />);
    const button = screen.getByRole('button', { name: 'Connecting…' });
    expect(button).toHaveProperty('disabled', true);
    expect(screen.queryByText('Still connecting. Try again in a moment.')).toBeNull();
  });

  it('enables Join once the room has loaded, and joins', async () => {
    const dispatch = vi.fn().mockResolvedValue({ ok: true, state: {} });
    const onJoined = vi.fn();
    current = loadedRoom(dispatch);
    render(<NameScreen code="K7QX" onBack={vi.fn()} onJoined={onJoined} />);
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Asha' } });
    const button = screen.getByRole('button', { name: 'Join the village' });
    expect(button).toHaveProperty('disabled', false);
    fireEvent.click(button);
    await waitFor(() => expect(onJoined).toHaveBeenCalled());
    expect(dispatch).toHaveBeenCalledWith({ type: 'join', name: 'Asha' });
  });
});
