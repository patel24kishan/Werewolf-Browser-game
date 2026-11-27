// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LobbyStep } from '@/host/steps/LobbyStep';
import { ReviewStep } from '@/host/steps/ReviewStep';
import { RolesStep } from '@/host/steps/RolesStep';
import { SessionStep } from '@/host/steps/SessionStep';
import { joinUrl } from '@/net';
import { lobby, step } from '../game/helpers';

// Stand-in that exposes the encoded value so the test can read it.
vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value, level }: { value: string; level: string }) => <svg data-value={value} data-level={level} />,
}));

afterEach(cleanup);

function roles(over: Partial<ComponentProps<typeof RolesStep>> = {}) {
  const props: ComponentProps<typeof RolesStep> = {
    code: 'K7QX',
    playerCount: 10,
    specialRoles: [],
    sheriffOn: true,
    error: null,
    busy: false,
    onPlayerCount: vi.fn(),
    onToggleRole: vi.fn(),
    onSheriff: vi.fn(),
    onNext: vi.fn(),
    onBack: vi.fn(),
    ...over,
  };
  render(<RolesStep {...props} />);
  return props;
}

describe('RolesStep', () => {
  it('shows the rulebook hint and steps the count', () => {
    const p = roles();
    expect(screen.getByText(/From the rulebook for 10 players/).textContent).toContain('2 Werewolves, 1 Seer, the rest Villagers.');
    fireEvent.click(screen.getByRole('button', { name: 'More players' }));
    expect(p.onPlayerCount).toHaveBeenCalledWith(11);
    fireEvent.click(screen.getByRole('button', { name: 'Fewer players' }));
    expect(p.onPlayerCount).toHaveBeenCalledWith(9);
  });
  it('disables Fewer at 5 players', () => {
    roles({ playerCount: 5 });
    expect((screen.getByRole('button', { name: 'Fewer players' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('disables More at 18 players', () => {
    roles({ playerCount: 18 });
    expect((screen.getByRole('button', { name: 'More players' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('toggles special roles with aria-pressed', () => {
    const p = roles({ specialRoles: ['witch'] });
    expect(screen.getByRole('button', { name: 'Witch' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Thief' }).getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Thief' }));
    expect(p.onToggleRole).toHaveBeenCalledWith('thief');
  });
  it('shows a tick box on each tile that follows the pressed state', () => {
    roles({ specialRoles: ['witch'] });
    const box = (name: string) => screen.getByRole('button', { name }).querySelector('.tile__check');
    expect(box('Witch')?.getAttribute('data-checked')).toBe('true');
    expect(box('Witch')?.querySelector('svg')).toBeTruthy();
    expect(box('Thief')?.getAttribute('data-checked')).toBe('false');
    expect(box('Thief')?.querySelector('svg')).toBeNull();
  });
  it('shows an inline error when there are too many specials', () => {
    roles({ playerCount: 5, specialRoles: ['witch', 'hunter', 'cupid', 'little-girl'] });
    expect(screen.getByRole('alert').textContent).toContain('at most 3 special roles');
  });
  it('flips the Sheriff switch', () => {
    const p = roles();
    const sw = screen.getByRole('switch', { name: /Elect a Sheriff/ });
    expect(sw.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(sw);
    expect(p.onSheriff).toHaveBeenCalledWith(false);
  });
});

describe('ReviewStep', () => {
  it('lists cards with counts and the summary', () => {
    render(<ReviewStep playerCount={10} specialRoles={['witch']} onEdit={() => undefined} onConfirm={() => undefined} />);
    expect(screen.getByText('Werewolf').nextSibling?.textContent).toBe('× 2');
    expect(screen.getByText('10 cards for 10 players')).toBeTruthy();
  });
  it('shows the Thief spare cards', () => {
    render(<ReviewStep playerCount={5} specialRoles={['witch', 'thief']} onEdit={() => undefined} onConfirm={() => undefined} />);
    expect(screen.getByText('7 cards: 5 players + 2 spare for the Thief')).toBeTruthy();
  });
  it('calls Edit and Looks good', () => {
    const onEdit = vi.fn();
    const onConfirm = vi.fn();
    render(<ReviewStep playerCount={8} specialRoles={[]} onEdit={onEdit} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Looks good' }));
    expect(onEdit).toHaveBeenCalled();
    expect(onConfirm).toHaveBeenCalled();
  });
});

describe('SessionStep', () => {
  it('labels the QR and builds the join url from the code and origin', () => {
    const { container } = render(
      <SessionStep code="K7QX" origin="https://wolf.example" hostMode="moderating" hostHasName={false} onHostMode={() => undefined} onNext={async () => null} onBack={() => undefined} />,
    );
    expect(screen.getByRole('img', { name: 'QR code to join game K7QX' })).toBeTruthy();
    const qr = container.querySelector('[data-value]');
    expect(qr?.getAttribute('data-value')).toBe(joinUrl('K7QX', 'https://wolf.example'));
    expect(qr?.getAttribute('data-value')).toBe('https://wolf.example/join?code=K7QX');
    expect(qr?.getAttribute('data-level')).toBe('M');
  });
  it('asks for a name when playing', () => {
    render(<SessionStep code="K7QX" origin="https://wolf.example" hostMode="playing" hostHasName={false} onHostMode={() => undefined} onNext={async () => null} onBack={() => undefined} />);
    expect(screen.getByLabelText('Your name')).toBeTruthy();
  });
});

describe('LobbyStep', () => {
  function lobbyProps(state = lobby({ players: 5, ready: false })) {
    return { code: 'K7QX', state, myId: 'host', busy: false, error: null, onRemove: vi.fn(), onStart: vi.fn(), onBack: vi.fn() };
  }
  it('disables Start and says who is missing', () => {
    const state = step(lobby({ players: 5, ready: true }), { type: 'setReady', actorId: 'p02', ready: false });
    render(<LobbyStep {...lobbyProps(state)} />);
    const start = screen.getByRole('button', { name: 'Start — waiting for Name p02' }) as HTMLButtonElement;
    expect(start.disabled).toBe(true);
  });
  it('enables Start when ready and confirms before removing', () => {
    const props = lobbyProps(lobby({ players: 5, ready: true }));
    render(<LobbyStep {...props} />);
    const start = screen.getByRole('button', { name: 'Start' }) as HTMLButtonElement;
    expect(start.disabled).toBe(false);
    fireEvent.click(start);
    expect(props.onStart).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Name p01' }));
    expect(screen.getByRole('dialog').textContent).toContain('Remove Name p01?');
    expect(props.onRemove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(props.onRemove).toHaveBeenCalledWith('p01');
  });
  it('shows the counts', () => {
    render(<LobbyStep {...lobbyProps(lobby({ players: 5, ready: false }))} />);
    expect(screen.getByText('5 / 5')).toBeTruthy();
    expect(screen.getByText('0 / 5')).toBeTruthy();
  });
});
