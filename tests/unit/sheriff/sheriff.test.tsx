// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { newRoomState, type RoomState } from '@/game';
import { Dashboard, type DashboardProps } from '@/host/dashboard/Dashboard';
import type { DashPlayer } from '@/host/dashboard/types';
import { AssignSheriff } from '@/host/sheriff/AssignSheriff';
import { sheriffCandidates } from '@/host/sheriff/sheriffStep';
import { SheriffHost } from '@/host/sheriff/SheriffHost';
import type { Room } from '@/net';
import { PlayerView } from '@/play/PlayerView';

afterEach(cleanup);

function stateWith(hostMode: 'moderating' | 'playing'): RoomState {
  const base = newRoomState('host', 1);
  if (!base.ok) throw new Error('state');
  const s = base.state;
  const mk = (name: string, alive = true) => ({ name, ready: true, connected: true, alive });
  return {
    ...s,
    meta: { ...s.meta, hostMode, status: 'dealt' },
    players: { host: mk('Hosta'), a: mk('Asha'), b: mk('Ben'), c: mk('Chloé', false), x: mk('Late') },
    cards: { a: { role: 'seer' }, b: { role: 'werewolf' }, c: { role: 'villager' }, ...(hostMode === 'playing' ? { host: { role: 'villager' } } : {}) },
  } as unknown as RoomState;
}

describe('sheriffCandidates', () => {
  it('lists living dealt players only; the moderating host is never listed', () => {
    expect(sheriffCandidates(stateWith('moderating')).map((p) => p.name)).toEqual(['Asha', 'Ben']);
  });
  it('includes a playing host', () => {
    expect(sheriffCandidates(stateWith('playing')).map((p) => p.name)).toEqual(['Asha', 'Ben', 'Hosta']);
  });
});

describe('AssignSheriff', () => {
  const players = [
    { id: 'a', name: 'Asha' },
    { id: 'b', name: 'Chloé' },
  ];
  function setup() {
    const onAssign = vi.fn();
    const onSkip = vi.fn();
    render(<AssignSheriff players={players} busy={false} error={null} onAssign={onAssign} onSkip={onSkip} />);
    return { onAssign, onSkip };
  }

  it('is a radio group, and the primary button is disabled until a player is chosen', () => {
    setup();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect((screen.getByRole('button', { name: 'Give the Sheriff card' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('names the choice and assigns it', () => {
    const { onAssign } = setup();
    fireEvent.click(screen.getByRole('radio', { name: 'Chloé' }));
    const button = screen.getByRole('button', { name: 'Give the Sheriff card to Chloé' }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(onAssign).toHaveBeenCalledWith('b');
  });

  it('Skip dispatches the skip', () => {
    const { onSkip } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Skip, no Sheriff this game' }));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('shows no Back button unless given one', () => {
    setup();
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });
});

describe('Dashboard Sheriff', () => {
  const players: DashPlayer[] = [
    { id: 'a', name: 'Asha', role: 'seer', alive: true, killed: false },
    { id: 'b', name: 'Ben', role: 'werewolf', alive: true, killed: false, sheriff: true },
  ];
  function setup(over: Partial<DashboardProps> = {}) {
    const props: DashboardProps = { status: 'day', players, busy: false, error: null, onSheriff: vi.fn(), onToggleKilled: vi.fn(), onNightFalls: vi.fn(), onLockIn: vi.fn(), ...over };
    render(<Dashboard {...props} />);
    return props;
  }

  it('shows the badge on the Sheriff row only, and the Sheriff action', () => {
    const p = setup();
    expect(screen.getAllByText('Sheriff', { selector: '.drow__badge' })).toHaveLength(1);
    expect(screen.queryByText('The Sheriff died. Ask them to name a successor.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Sheriff' }));
    expect(p.onSheriff).toHaveBeenCalledTimes(1);
  });

  it('shows the succession prompt and the badge when the Sheriff is dead', () => {
    const p = setup({ players: [players[0], { ...players[1], alive: false }] });
    expect(screen.getByText('The Sheriff died. Ask them to name a successor.')).toBeTruthy();
    expect(screen.getByText('Sheriff', { selector: '.drow__badge' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Choose the new Sheriff' }));
    expect(p.onSheriff).toHaveBeenCalledTimes(1);
  });

  it('has no Sheriff controls when the Sheriff is off', () => {
    setup({ onSheriff: undefined, players: [players[0], { ...players[1], alive: false, sheriff: false }] });
    expect(screen.queryByRole('button', { name: 'Sheriff' })).toBeNull();
    expect(screen.queryByText('The Sheriff died. Ask them to name a successor.')).toBeNull();
  });
});

describe('PlayerView', () => {
  const base = { name: 'Chloé', code: 'K7QX', role: 'seer', playerId: 'c' };

  it('shows the Sheriff card only for a living Sheriff', () => {
    render(<PlayerView {...base} isSheriff alive />);
    expect(screen.getByRole('heading', { name: "You're the Sheriff" })).toBeTruthy();
    expect(screen.getByAltText('Sheriff card')).toBeTruthy();
  });

  it('the role tile switches to the normal role card', () => {
    render(<PlayerView {...base} isSheriff alive />);
    fireEvent.click(screen.getByRole('button', { name: /Your secret role card/ }));
    expect(screen.getByRole('button', { name: 'Your card, face down. Tap to reveal.' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: "You're the Sheriff" })).toBeNull();
  });

  it('shows the plain card for a non-Sheriff', () => {
    render(<PlayerView {...base} isSheriff={false} alive />);
    expect(screen.queryByRole('heading', { name: "You're the Sheriff" })).toBeNull();
    expect(screen.getByRole('button', { name: 'Your card, face down. Tap to reveal.' })).toBeTruthy();
  });

  it('a dead Sheriff gets the dead screen, not the Sheriff card', () => {
    render(<PlayerView {...base} isSheriff alive={false} killedAt={undefined} />);
    expect(screen.queryByRole('heading', { name: "You're the Sheriff" })).toBeNull();
    expect(screen.getByText('Dead')).toBeTruthy();
  });
});

describe('SheriffHost storage', () => {
  it.each(['skip', 'assign'] as const)('keeps no role id in sessionStorage after %s', async (how) => {
    window.sessionStorage.clear();
    const state = { ...stateWith('moderating'), sheriff: null };
    const room = { dispatch: vi.fn().mockResolvedValue({ ok: true }) } as unknown as Room;
    render(<SheriffHost room={room} state={state} code="K7QX">{() => <p>dashboard</p>}</SheriffHost>);
    if (how === 'skip') fireEvent.click(screen.getByRole('button', { name: 'Skip, no Sheriff this game' }));
    else {
      fireEvent.click(screen.getByRole('radio', { name: 'Asha' }));
      fireEvent.click(screen.getByRole('button', { name: 'Give the Sheriff card to Asha' }));
    }
    await waitFor(() => expect(screen.getByText('dashboard')).toBeTruthy());
    expect(window.sessionStorage.length).toBeGreaterThan(0);
    const dump = Object.keys(window.sessionStorage).map((k) => `${k}=${window.sessionStorage.getItem(k)}`).join(', ');
    for (const role of ['seer', 'werewolf', 'villager']) expect(dump).not.toContain(role);
  });
});
