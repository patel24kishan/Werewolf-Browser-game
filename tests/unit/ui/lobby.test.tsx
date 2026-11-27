// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlayerLobby } from '@/play/PlayerLobby';

afterEach(cleanup);

const players = [
  { id: 'a', name: 'Asha', ready: false },
  { id: 'b', name: 'Ben', ready: true },
];

function setup(myReady: boolean) {
  const onSetReady = vi.fn();
  const onLeave = vi.fn();
  render(
    <PlayerLobby
      code="K7QX"
      myId="a"
      players={[{ ...players[0], ready: myReady }, players[1]]}
      required={5}
      joined={2}
      onSetReady={onSetReady}
      onLeave={onLeave}
    />,
  );
  return { onSetReady, onLeave };
}

describe('PlayerLobby', () => {
  it('lists players with status as text, marks "(you)" and shows the count', () => {
    setup(false);
    expect(screen.getByText(/2 of 5 players have joined/)).toBeTruthy();
    expect(screen.getByText('(you)')).toBeTruthy();
    expect(screen.getByText('Ready')).toBeTruthy();
    expect(screen.getByText('Not ready')).toBeTruthy();
  });

  it('toggles ready on and off', () => {
    const first = setup(false);
    fireEvent.click(screen.getByRole('button', { name: "I'm ready" }));
    expect(first.onSetReady).toHaveBeenCalledWith(true);
    cleanup();
    const second = setup(true);
    const button = screen.getByRole('button', { name: "I'm ready" });
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Tap again to undo.')).toBeTruthy();
    fireEvent.click(button);
    expect(second.onSetReady).toHaveBeenCalledWith(false);
  });

  it('asks before leaving', () => {
    const { onLeave } = setup(false);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onLeave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it('Escape cancels the leave sheet', () => {
    const { onLeave } = setup(false);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onLeave).not.toHaveBeenCalled();
  });
});
