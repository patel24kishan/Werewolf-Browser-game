// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import cardMix from '@/game/data/card-mix.json';
import roles from '@/game/data/roles.json';
import { HelpButton } from '@/guide/HelpButton';

afterEach(cleanup);

function open() {
  render(<HelpButton />);
  const help = screen.getByRole('button', { name: 'How to play' });
  fireEvent.click(help);
  return help;
}

describe('Guide', () => {
  it('renders nothing until opened', () => {
    render(<HelpButton />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('is a labelled modal dialog with focus on the close button', () => {
    open();
    const dialog = screen.getByRole('dialog', { name: 'How to play' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close guide' }));
  });

  it('shows the section headings in order', () => {
    open();
    const names = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(names).toEqual(['The goal', 'The roles', 'A round', 'Rules', 'Card mix', 'Using the app', 'Tips']);
  });

  it('renders one card-mix row per JSON entry with matching numbers', () => {
    open();
    const table = screen.getByRole('table');
    expect(within(table).getByText('Base cards for each player count')).toBeTruthy();
    const rows = within(table).getAllByRole('row').slice(1);
    const entries = Object.entries(cardMix).sort((a, b) => Number(a[0]) - Number(b[0]));
    expect(rows).toHaveLength(entries.length);
    entries.forEach(([players, mix], i) => {
      const cells = rows[i].querySelectorAll('th, td');
      expect(cells[0].querySelector('span')?.textContent).toBe(players);
      expect(cells[1].textContent).toBe(String(mix.werewolves));
      expect(cells[2].textContent).toBe(String(mix.seer));
      expect(cells[3].textContent).toBe(String(mix.villagers));
    });
    expect(within(table).getAllByText('small lobby').length).toBeGreaterThan(0);
  });

  it('lists every role with its power', () => {
    open();
    for (const role of Object.values(roles)) {
      expect(screen.getAllByText(role.name).length).toBeGreaterThan(0);
      expect(screen.getByText(role.power)).toBeTruthy();
    }
  });

  it('closes with the X button and returns focus to the ? button', () => {
    const help = open();
    fireEvent.click(screen.getByRole('button', { name: 'Close guide' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(help);
  });

  it('closes with Escape and returns focus', () => {
    const help = open();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(help);
  });

  it('locks page scroll while open and restores it', () => {
    open();
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.click(screen.getByRole('button', { name: 'Close guide' }));
    expect(document.body.style.overflow).toBe('');
  });

  it('chips scroll to the section and focus its heading', () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Card mix' }));
    const heading = screen.getByRole('heading', { name: 'Card mix' });
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll.mock.contexts[0]).toBe(heading.closest('section'));
    expect(document.activeElement).toBe(heading);
  });
});
