// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AttackOverlay } from '@/play/AttackOverlay';
import { ATTACK_VIBRATION, seenKey } from '@/play/attackEffects';

const props = { name: 'Farah', code: 'K7QX', playerId: 'p1', role: 'villager' };

function mockMotion(reduced: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: reduced && query.includes('reduce'),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  sessionStorage.clear();
  mockMotion(false);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  Reflect.deleteProperty(navigator, 'vibrate');
});

describe('AttackOverlay', () => {
  it('vibrates, plays the attack once and announces', () => {
    const vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
    const { container } = render(<AttackOverlay {...props} killedAt={1000} />);
    expect(vibrate).toHaveBeenCalledWith([...ATTACK_VIBRATION]);
    expect(container.querySelector('.attack-flash')).not.toBeNull();
    expect(container.querySelector('.attack-flash')?.getAttribute('data-strong')).toBe('false');
    expect(container.querySelector('[aria-live="assertive"]')?.textContent).toBe('You were killed in the night.');
    expect(screen.getByRole('heading', { name: 'The wolves got you' })).toBeTruthy();
    expect(sessionStorage.getItem(seenKey('K7QX', 'p1'))).toBe('1000');
  });

  it('uses the stronger flash when the phone cannot vibrate', () => {
    const { container } = render(<AttackOverlay {...props} killedAt={1000} />);
    expect(container.querySelector('.attack-flash')?.getAttribute('data-strong')).toBe('true');
  });

  it('ends the animation after 1.2 s and keeps the dead state', () => {
    vi.useFakeTimers();
    const { container } = render(<AttackOverlay {...props} killedAt={1000} />);
    expect(container.querySelector('.attack-flash')).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(1300);
    });
    expect(container.querySelector('.attack-flash')).toBeNull();
    expect(screen.getByText('You were killed in the night.')).toBeTruthy();
    expect(screen.getByText('Dead')).toBeTruthy();
  });

  it('shows the static frame with claw marks and no flash under reduced motion', () => {
    mockMotion(true);
    const { container } = render(<AttackOverlay {...props} killedAt={1000} />);
    expect(container.querySelector('.attack-flash')).toBeNull();
    expect(container.querySelector('.dead')?.getAttribute('data-playing')).toBe('false');
    expect(screen.getByTestId('claws')).toBeTruthy();
  });

  it('does not replay when the same killedAt was already seen', () => {
    const vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
    sessionStorage.setItem(seenKey('K7QX', 'p1'), '1000');
    const { container } = render(<AttackOverlay {...props} killedAt={1000} />);
    expect(vibrate).not.toHaveBeenCalled();
    expect(container.querySelector('.attack-flash')).toBeNull();
    expect(container.querySelector('[aria-live="assertive"]')?.textContent).toBe('');
    expect(screen.getByRole('heading', { name: 'The wolves got you' })).toBeTruthy();
  });

  it('plays again for a different killedAt', () => {
    const vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
    sessionStorage.setItem(seenKey('K7QX', 'p1'), '1000');
    render(<AttackOverlay {...props} killedAt={2000} />);
    expect(vibrate).toHaveBeenCalledTimes(1);
  });
});
