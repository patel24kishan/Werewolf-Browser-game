// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmKillsSheet } from '@/host/dashboard/ConfirmKillsSheet';
import { Dashboard, type DashboardProps } from '@/host/dashboard/Dashboard';
import { DawnScreen } from '@/host/dashboard/DawnScreen';
import type { DashPlayer } from '@/host/dashboard/types';

afterEach(cleanup);

const players: DashPlayer[] = [
  { id: 'a', name: 'Asha', role: 'seer', alive: true, killed: false },
  { id: 'b', name: 'Ben', role: 'werewolf', alive: true, killed: false },
  { id: 'f', name: 'Farah', role: 'villager', alive: false, killed: false },
];

function setup(over: Partial<DashboardProps> = {}) {
  const props: DashboardProps = {
    status: 'night',
    players,
    busy: false,
    error: null,
    onToggleKilled: vi.fn(),
    onNightFalls: vi.fn(),
    onLockIn: vi.fn(),
    ...over,
  };
  render(<Dashboard {...props} />);
  return props;
}

describe('Dashboard primary button', () => {
  it.each(['dealt', 'day'] as const)('says Night falls in %s and starts the night', (status) => {
    const p = setup({ status });
    fireEvent.click(screen.getByRole('button', { name: 'Night falls' }));
    expect(p.onNightFalls).toHaveBeenCalledTimes(1);
  });

  it('shows the lock label for 0, 1 and 2 kills at night', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Lock in — no kills tonight' })).toBeTruthy();
    cleanup();
    setup({ players: [{ ...players[0], killed: true }, players[1], players[2]] });
    expect(screen.getByRole('button', { name: 'Lock in 1 kill' })).toBeTruthy();
    cleanup();
    setup({ players: [{ ...players[0], killed: true }, { ...players[1], killed: true }, players[2]] });
    expect(screen.getByRole('button', { name: 'Lock in 2 kills' })).toBeTruthy();
  });

  it('opens the confirm sheet from the lock button, and Lock in confirms', () => {
    const p = setup({ players: [{ ...players[0], killed: true }, players[1], players[2]] });
    fireEvent.click(screen.getByRole('button', { name: 'Lock in 1 kill' }));
    const sheet = screen.getByRole('dialog');
    expect(within(sheet).getByText("Lock in tonight's kills?")).toBeTruthy();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Lock in' }));
    expect(p.onLockIn).toHaveBeenCalledTimes(1);
  });
});

describe('Dashboard rows', () => {
  it('disables dead rows and says Dead; living rows toggle at night', () => {
    const p = setup();
    const dead = screen.getByRole('checkbox', { name: 'Killed: Farah' }) as HTMLInputElement;
    expect(dead.disabled).toBe(true);
    expect(screen.getByText('Dead')).toBeTruthy();
    const asha = screen.getByRole('checkbox', { name: 'Killed: Asha' }) as HTMLInputElement;
    expect(asha.disabled).toBe(false);
    fireEvent.click(asha);
    expect(p.onToggleKilled).toHaveBeenCalledWith('a');
  });

  it('renders a dead player as dead in the day even if night.killed still holds them', () => {
    setup({ status: 'day', players: [players[0], { ...players[2], killed: true }] });
    const box = screen.getByRole('checkbox', { name: 'Killed: Farah' }) as HTMLInputElement;
    expect(box.disabled).toBe(true);
    expect(box.checked).toBe(false);
    const row = box.closest('li')!;
    expect(row.className).toContain('drow--dead');
    expect(row.className).not.toContain('drow--killed');
    expect(within(row).getByText('Dead')).toBeTruthy();
  });

  it('disables every toggle outside the night', () => {
    setup({ status: 'day' });
    for (const box of screen.getAllByRole('checkbox')) expect((box as HTMLInputElement).disabled).toBe(true);
  });

  it('does not show roles in the list', () => {
    setup();
    expect(screen.queryByText('Seer')).toBeNull();
    expect(screen.queryByText('Werewolf')).toBeNull();
  });
});

describe('Card overlay', () => {
  it('opens on name tap showing the role, and returns focus on Escape', () => {
    setup();
    const name = screen.getByRole('button', { name: 'Ben' });
    name.focus();
    fireEvent.click(name);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Werewolf' })).toBeTruthy();
    expect(within(dialog).getByText('Tap anywhere to close')).toBeTruthy();
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Close card' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(name);
  });

  it('closes with the X and by tapping the backdrop', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Asha' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close card' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Asha' }));
    fireEvent.click(screen.getByRole('dialog'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('ConfirmKillsSheet', () => {
  it('lists victims, Undo toggles them, Go back and Escape cancel', () => {
    const onUndo = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmKillsSheet victims={[{ ...players[0], killed: true }]} busy={false} onUndo={onUndo} onCancel={onCancel} onConfirm={vi.fn()} />);
    expect(screen.getByText('Asha')).toBeTruthy();
    expect(screen.getByText(/Seer · killed by the wolves/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Undo Asha' }));
    expect(onUndo).toHaveBeenCalledWith('a');
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});

describe('DawnScreen', () => {
  it('names the victim, reveals and undoes the lock', () => {
    const onReveal = vi.fn();
    const onUndoLock = vi.fn();
    render(<DawnScreen victims={['Farah']} busy={false} error={null} onReveal={onReveal} onUndoLock={onUndoLock} />);
    expect(screen.getByText('1 kill locked')).toBeTruthy();
    expect(screen.getByText("Farah's phone will shake and show the werewolf attack.")).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reveal' }));
    expect(onReveal).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Undo lock' }));
    expect(onUndoLock).toHaveBeenCalledTimes(1);
  });
});
