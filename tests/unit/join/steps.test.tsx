// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodeStep } from '@/join/CodeStep';
import { NameStep } from '@/join/NameStep';
import { joinErrorMessage } from '@/join/joinErrors';

afterEach(cleanup);

describe('CodeStep', () => {
  function setup(checkRoom = vi.fn(async (code: string) => (code ? { ok: true as const } : { ok: true as const }))) {
    const onContinue = vi.fn();
    render(<CodeStep checkRoom={checkRoom} onContinue={onContinue} onScan={vi.fn()} onBack={vi.fn()} />);
    return { checkRoom, onContinue, input: screen.getByLabelText('Game code') as HTMLInputElement };
  }

  it('is a labelled single input with code attributes', () => {
    const { input } = setup();
    expect(input.getAttribute('autocapitalize')).toBe('characters');
    expect(input.getAttribute('autocomplete')).toBe('off');
    expect(input.maxLength).toBe(4);
  });

  it('shows an error on blur for a short code and links it with aria-describedby', () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: 'k7' } });
    fireEvent.blur(input);
    const error = screen.getByRole('alert');
    expect(error.textContent).toContain('4 characters');
    expect(input.getAttribute('aria-describedby')).toContain(error.id);
  });

  it('uppercases, checks the room and continues', async () => {
    const { input, checkRoom, onContinue } = setup();
    fireEvent.change(input, { target: { value: 'k7qx' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(onContinue).toHaveBeenCalledWith('K7QX'));
    expect(checkRoom).toHaveBeenCalledWith('K7QX');
  });

  it('shows "No game with code" and does not continue', async () => {
    const { input, onContinue } = setup(vi.fn(async () => ({ ok: false as const, message: 'No game with code K7QX' })) as never);
    fireEvent.change(input, { target: { value: 'K7QX' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect((await screen.findByRole('alert')).textContent).toBe('No game with code K7QX');
    expect(onContinue).not.toHaveBeenCalled();
  });
});

describe('NameStep', () => {
  it('shows a reducer error next to the field', async () => {
    const onJoin = vi.fn(async () => ({
      ok: false as const,
      message: joinErrorMessage({ code: 'name-taken', message: 'x' }, 'K7QX'),
    }));
    render(<NameStep code="K7QX" onJoin={onJoin} onBack={vi.fn()} />);
    const input = screen.getByLabelText('Your name');
    fireEvent.change(input, { target: { value: 'Asha' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join the village' }));
    const error = await screen.findByRole('alert');
    expect(error.textContent).toBe('That name is taken. Try another.');
    expect(input.getAttribute('aria-describedby')).toContain(error.id);
    expect(onJoin).toHaveBeenCalledWith('Asha');
  });

  it('does not submit twice while busy', () => {
    let finish: (v: { ok: true }) => void = () => undefined;
    const onJoin = vi.fn(() => new Promise<{ ok: true }>((r) => (finish = r)));
    render(<NameStep code="K7QX" onJoin={onJoin} onBack={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Asha' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join the village' }));
    fireEvent.click(screen.getByRole('button', { name: 'Joining…' }));
    expect(onJoin).toHaveBeenCalledTimes(1);
    finish({ ok: true });
  });
});
